import {
	Marked,
	Renderer,
	type RendererThis,
	type Token,
	type TokenizerAndRendererExtension,
	type Tokens,
} from 'marked';
import type { EmbeddedImage } from '../domain/publication';
import { attachmentNameForPath } from './attachment-name';
import { parseObsidianMarkdown } from './obsidian-marked-extension';
import type { CalloutToken, ImageEmbedToken, WikiLinkToken } from './types';

export interface ConversionContext {
	sourcePath: string;
	spaceKey: string;
	pageTitles: Map<string, string>;
	resolveLink(target: string, sourcePath: string): string | null;
}

export interface ConversionIssue {
	code: 'unresolved-image';
	target: string;
}

export interface ConversionResult {
	storage: string;
	images: EmbeddedImage[];
	issues: ConversionIssue[];
}

function isXmlCharacter(codePoint: number): boolean {
	return codePoint === 0x9
		|| codePoint === 0xa
		|| codePoint === 0xd
		|| (codePoint >= 0x20 && codePoint <= 0xd7ff)
		|| (codePoint >= 0xe000 && codePoint <= 0xfffd)
		|| (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function xmlCharacters(value: string): string {
	return Array.from(value, (character) =>
		isXmlCharacter(character.codePointAt(0) ?? 0) ? character : '\ufffd',
	).join('');
}

function escapeXml(value: string): string {
	return xmlCharacters(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function markedText(value: string): string {
	// Marked has already escaped token text; escaping it again would double XML entities.
	return xmlCharacters(value)
		.replace(/&#39;/g, '&apos;')
		.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');
}

function hasOnlyXmlEntities(value: string): boolean {
	return xmlCharacters(value) === value
		&& !/&(?!(?:amp|lt|gt|quot|apos);)/.test(value);
}

function hasSafeCharacterData(value: string): boolean {
	return !value.includes(']]>') && hasOnlyXmlEntities(value);
}

function hasSafeAttributes(value: string): boolean {
	let remaining = value;
	const names = new Set<string>();
	const attribute = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"]*"|'[^']*')/;
	while (remaining.trim()) {
		const match = attribute.exec(remaining);
		if (!match) return false;
		const name = match[1];
		const attributeValue = match[2].slice(1, -1);
		if (name.includes(':') || names.has(name)) return false;
		if (attributeValue.includes('<') || !hasOnlyXmlEntities(attributeValue)) {
			return false;
		}
		names.add(name);
		remaining = remaining.slice(match[0].length);
	}
	return true;
}

function scanXmlFragment(value: string, stack: string[]): boolean {
	const markup = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g;
	let offset = 0;
	for (const match of value.matchAll(markup)) {
		const text = value.slice(offset, match.index);
		if (text.includes('<') || !hasSafeCharacterData(text)) return false;
		const tag = match[0];
		offset = (match.index ?? 0) + tag.length;

		if (tag.startsWith('<!--')) {
			const comment = tag.slice(4, -3);
			if (
				comment.includes('--')
				|| comment.endsWith('-')
				|| xmlCharacters(comment) !== comment
			) return false;
			continue;
		}
		if (tag.startsWith('<![CDATA[')) {
			const cdata = tag.slice(9, -3);
			if (xmlCharacters(cdata) !== cdata) return false;
			continue;
		}

		const closing = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(tag);
		if (closing) {
			if (stack.pop() !== closing[1]) return false;
			continue;
		}

		const opening = /^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/.exec(tag);
		if (!opening || opening[1].includes(':') || !hasSafeAttributes(opening[2])) {
			return false;
		}
		if (!opening[3]) stack.push(opening[1]);
	}

	const tail = value.slice(offset);
	return !tail.includes('<') && hasSafeCharacterData(tail);
}

function markSafeHtml(tokens: Token[], safeTokens: WeakSet<object>): void {
	const inlineHtml = tokens.filter((token) =>
		token.type === 'html' && !(token as Tokens.HTML).block,
	) as Tokens.HTML[];
	if (inlineHtml.length > 0) {
		const stack: string[] = [];
		if (inlineHtml.every((token) => scanXmlFragment(token.text, stack)) && stack.length === 0) {
			inlineHtml.forEach((token) => safeTokens.add(token));
		}
	}

	for (const token of tokens) {
		if (token.type === 'html' && (token as Tokens.HTML).block) {
			const stack: string[] = [];
			if (scanXmlFragment((token as Tokens.HTML).text, stack) && stack.length === 0) {
				safeTokens.add(token);
			}
		}
		if ('tokens' in token && Array.isArray(token.tokens)) {
			markSafeHtml(token.tokens, safeTokens);
		}
		if (token.type === 'list') {
			for (const item of token.items) markSafeHtml(item.tokens, safeTokens);
		}
		if (token.type === 'table') {
			for (const cell of token.header) markSafeHtml(cell.tokens, safeTokens);
			for (const row of token.rows) {
				for (const cell of row) markSafeHtml(cell.tokens, safeTokens);
			}
		}
	}
}

function displayText(token: WikiLinkToken): string {
	if (token.alias !== null) return token.alias;
	if (!token.target) return token.heading ?? '';
	return token.heading === null ? token.target : `${token.target}#${token.heading}`;
}

function calloutMacroName(type: string): string {
	switch (type.toUpperCase()) {
		case 'WARNING':
		case 'CAUTION':
			return 'warning';
		case 'TIP':
		case 'HINT':
			return 'tip';
		case 'IMPORTANT':
			return 'note';
		default:
			return 'info';
	}
}

function parseItemBody(parser: RendererThis['parser'], item: Tokens.ListItem): string {
	return parser.parse(item.tokens, !!item.loose);
}

export function convertMarkdown(
	markdown: string,
	context: ConversionContext,
): ConversionResult {
	const renderedImages: EmbeddedImage[] = [];
	const issues: ConversionIssue[] = [];
	const safeHtmlTokens = new WeakSet<object>();
	let taskId = 0;
	const renderer = new Renderer();

	renderer.heading = function (this: Renderer, token: Tokens.Heading): string {
		return `<h${token.depth}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
	};
	renderer.code = function (token: Tokens.Code): string {
		const language = token.lang
			? `<ac:parameter ac:name="language">${escapeXml(token.lang)}</ac:parameter>`
			: '';
		const body = xmlCharacters(token.text).replace(/]]>/g, ']]]]><![CDATA[>');
		return `<ac:structured-macro ac:name="code">${language}<ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>\n`;
	};
	renderer.blockquote = function (this: Renderer, token: Tokens.Blockquote): string {
		return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>\n`;
	};
	renderer.hr = function (): string {
		return '<hr/>\n';
	};
	renderer.list = function (this: Renderer, token: Tokens.List): string {
		const normalTag = token.ordered ? 'ol' : 'ul';
		let output = '';
		let index = 0;

		while (index < token.items.length) {
			const segmentIndex = index;
			const taskSegment = token.items[index].task;
			const segment: Tokens.ListItem[] = [];
			while (index < token.items.length && token.items[index].task === taskSegment) {
				segment.push(token.items[index]);
				index++;
			}

			if (taskSegment) {
				const tasks = segment.map((item) => {
					const status = item.checked ? 'complete' : 'incomplete';
					const id = ++taskId;
					return `<ac:task><ac:task-id>${id}</ac:task-id><ac:task-status>${status}</ac:task-status><ac:task-body>${parseItemBody(this.parser, item)}</ac:task-body></ac:task>`;
				}).join('\n');
				output += `<ac:task-list>${tasks}</ac:task-list>\n`;
			} else {
				const start = token.ordered
					? (token.start || 1) + segmentIndex
					: 1;
				const startAttribute = token.ordered && start !== 1
					? ` start="${start}"`
					: '';
				const items = segment
					.map((item) => `<li>${parseItemBody(this.parser, item)}</li>`)
					.join('\n');
				output += `<${normalTag}${startAttribute}>${items}</${normalTag}>\n`;
			}
		}

		return output;
	};
	renderer.listitem = function (this: Renderer, item: Tokens.ListItem): string {
		return `<li>${this.parser.parse(item.tokens)}</li>\n`;
	};
	renderer.paragraph = function (this: Renderer, token: Tokens.Paragraph): string {
		return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
	};
	renderer.table = function (this: Renderer, token: Tokens.Table): string {
		const header = token.header
			.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
			.join('\n');
		const rows = token.rows.map((row) => {
			const cells = row
				.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`)
				.join('\n');
			return `<tr>${cells}</tr>`;
		}).join('\n');
		return `<table><tbody><tr>${header}</tr>${rows}</tbody></table>\n`;
	};
	renderer.html = function (token: Tokens.HTML | Tokens.Tag): string {
		return safeHtmlTokens.has(token) ? token.text : escapeXml(token.text);
	};
	renderer.strong = function (this: Renderer, token: Tokens.Strong): string {
		return `<strong>${this.parser.parseInline(token.tokens)}</strong>`;
	};
	renderer.em = function (this: Renderer, token: Tokens.Em): string {
		return `<em>${this.parser.parseInline(token.tokens)}</em>`;
	};
	renderer.codespan = function (token: Tokens.Codespan): string {
		return `<code>${markedText(token.text)}</code>`;
	};
	renderer.br = function (): string {
		return '<br/>';
	};
	renderer.del = function (this: Renderer, token: Tokens.Del): string {
		return `<del>${this.parser.parseInline(token.tokens)}</del>`;
	};
	renderer.link = function (this: Renderer, token: Tokens.Link): string {
		const title = token.title ? ` title="${markedText(token.title)}"` : '';
		return `<a href="${escapeXml(token.href)}"${title}>${this.parser.parseInline(token.tokens)}</a>`;
	};
	renderer.image = function (token: Tokens.Image): string {
		const alt = markedText(token.text || token.title || '');
		const altAttribute = alt ? ` ac:alt="${alt}"` : '';
		return `<ac:image${altAttribute}><ri:url ri:value="${escapeXml(token.href)}"/></ac:image>`;
	};
	renderer.text = function (
		this: Renderer,
		token: Tokens.Text | Tokens.Escape | Tokens.Tag,
	): string {
		if ('tokens' in token && token.tokens?.length) {
			return this.parser.parseInline(token.tokens);
		}
		return markedText(token.text);
	};
	renderer.space = function (): string {
		return '';
	};

	const wikiLinkRenderer: TokenizerAndRendererExtension = {
		name: 'obsidian-wikilink',
		renderer(genericToken) {
			const token = genericToken as unknown as WikiLinkToken;
			const display = escapeXml(displayText(token));
			const anchor = token.heading === null
				? ''
				: ` ac:anchor="${escapeXml(token.heading)}"`;

			if (!token.target && token.heading !== null) {
				return `<ac:link${anchor}><ac:link-body>${display}</ac:link-body></ac:link>`;
			}

			const resolvedPath = context.resolveLink(token.target, context.sourcePath);
			const title = resolvedPath === null ? undefined : context.pageTitles.get(resolvedPath);
			if (title !== undefined) {
				return `<ac:link${anchor}><ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(context.spaceKey)}"/><ac:link-body>${display}</ac:link-body></ac:link>`;
			}
			return token.embed ? `<em>(see: ${display})</em>` : display;
		},
	};

	const imageRenderer: TokenizerAndRendererExtension = {
		name: 'obsidian-image',
		renderer(genericToken) {
			const token = genericToken as unknown as ImageEmbedToken;
			const resolvedPath = context.resolveLink(token.target, context.sourcePath);
			if (resolvedPath === null) {
				issues.push({ code: 'unresolved-image', target: token.target });
				return escapeXml(token.alt ?? token.target);
			}

			const attachmentName = attachmentNameForPath(resolvedPath);
			renderedImages.push({
				sourcePath: token.target,
				resolvedPath,
				attachmentName,
				width: token.width,
			});
			const width = token.width !== null && Number.isFinite(token.width)
				? ` ac:width="${token.width}"`
				: '';
			const alt = token.alt === null ? '' : ` ac:alt="${escapeXml(token.alt)}"`;
			return `<ac:image${width}${alt}><ri:attachment ri:filename="${escapeXml(attachmentName)}"/></ac:image>`;
		},
	};

	const calloutRenderer: TokenizerAndRendererExtension = {
		name: 'obsidian-callout',
		renderer(genericToken) {
			const token = genericToken as unknown as CalloutToken;
			const title = token.title === null
				? ''
				: `<ac:parameter ac:name="title">${escapeXml(token.title)}</ac:parameter>`;
			const body = this.parser.parse(token.tokens as Token[]);
			return `<ac:structured-macro ac:name="${calloutMacroName(token.calloutType)}">${title}<ac:rich-text-body>${body}</ac:rich-text-body></ac:structured-macro>\n`;
		},
	};

	const marked = new Marked({
		renderer,
		extensions: [wikiLinkRenderer, imageRenderer, calloutRenderer],
	});
	const parsed = parseObsidianMarkdown(markdown);
	markSafeHtml(parsed.tokens, safeHtmlTokens);
	const storage = marked.parser(parsed.tokens);
	const images = renderedImages.filter((image, index, all) =>
		all.findIndex((candidate) =>
			candidate.resolvedPath === image.resolvedPath
			&& candidate.attachmentName === image.attachmentName,
		) === index,
	);

	return { storage, images, issues };
}
