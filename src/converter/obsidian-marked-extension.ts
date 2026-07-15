import {
	Marked,
	type Token,
	type TokenizerAndRendererExtension,
	type Tokens,
} from 'marked';
import type {
	CalloutToken,
	ImageEmbedToken,
	ParsedMarkdown,
	WikiLinkToken,
} from './types';

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|bmp)$/i;
const CALLOUT_START = /^>[ \t]?\[!(\w+)\]([+-])?[ \t]*(.*?)(\r?\n|$)/;
const NEXT_CALLOUT = /^>[ \t]?\[!\w+\]/;

interface MarkdownFence {
	marker: '`' | '~';
	length: number;
}

function nullablePart(value: string | undefined): string | null {
	return value ? value : null;
}

function splitAlias(body: string): { target: string; alias: string | null } {
	const separator = body.indexOf('|');
	if (separator === -1) {
		return { target: body, alias: null };
	}
	return {
		target: body.slice(0, separator),
		alias: nullablePart(body.slice(separator + 1)),
	};
}

function isImageTarget(target: string): boolean {
	return IMAGE_EXTENSION.test(target);
}

function openingFence(line: string): MarkdownFence | null {
	const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
	if (!match) {
		return null;
	}
	return {
		marker: match[1][0] as MarkdownFence['marker'],
		length: match[1].length,
	};
}

function closesFence(line: string, fence: MarkdownFence): boolean {
	const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
	return match !== null
		&& match[1][0] === fence.marker
		&& match[1].length >= fence.length;
}

const calloutExtension: TokenizerAndRendererExtension = {
	name: 'obsidian-callout',
	level: 'block',
	start(src) {
		return src.search(/^>[ \t]?\[!\w+\]/m);
	},
	tokenizer(src) {
		const header = CALLOUT_START.exec(src);
		if (!header) {
			return undefined;
		}

		let raw = header[0];
		let body = '';
		let offset = raw.length;
		let fence: MarkdownFence | null = null;
		while (offset < src.length) {
			const remaining = src.slice(offset);
			if (!remaining.startsWith('>')) {
				break;
			}

			const newline = remaining.indexOf('\n');
			const lineLength = newline === -1 ? remaining.length : newline + 1;
			const line = remaining.slice(0, lineLength);
			const bodyLine = line.replace(/^>[ \t]?/, '');
			const bodyLineWithoutEnding = bodyLine.replace(/\r?\n$/, '');
			if (fence === null && NEXT_CALLOUT.test(remaining)) {
				break;
			}
			raw += line;
			body += bodyLine;
			offset += lineLength;

			if (fence === null) {
				fence = openingFence(bodyLineWithoutEnding);
			} else if (closesFence(bodyLineWithoutEnding, fence)) {
				fence = null;
			}
		}

		const marker = header[2];
		const token: CalloutToken = {
			type: 'obsidian-callout',
			raw,
			calloutType: header[1],
			title: nullablePart(header[3].trim()),
			folded: marker === '-' ? true : marker === '+' ? false : null,
			tokens: body ? this.lexer.blockTokens(body) : [],
		};
		return token as Tokens.Generic;
	},
	childTokens: ['tokens'],
};

const imageExtension: TokenizerAndRendererExtension = {
	name: 'obsidian-image',
	level: 'inline',
	start(src) {
		return src.indexOf('![[');
	},
	tokenizer(src) {
		const match = /^!\[\[([^\]\r\n]*)\]\]/.exec(src);
		if (!match) {
			return undefined;
		}

		const body = match[1];
		if (!body || body.includes('[[')) {
			return undefined;
		}

		const { target, alias } = splitAlias(body);
		if (!isImageTarget(target)) {
			return undefined;
		}

		const numericWidth = alias !== null && /^\d+$/.test(alias)
			? Number(alias)
			: null;
		const hasWidth = numericWidth !== null && Number.isFinite(numericWidth);
		const token: ImageEmbedToken = {
			type: 'obsidian-image',
			raw: match[0],
			target,
			width: hasWidth ? numericWidth : null,
			alt: hasWidth ? null : alias,
		};
		return token as Tokens.Generic;
	},
};

const wikiLinkExtension: TokenizerAndRendererExtension = {
	name: 'obsidian-wikilink',
	level: 'inline',
	start(src) {
		return src.search(/!?\[\[/);
	},
	tokenizer(src) {
		const match = /^(!?)\[\[([^\]\r\n]*)\]\]/.exec(src);
		if (!match) {
			return undefined;
		}

		const body = match[2];
		if (!body || body.includes('[[')) {
			return undefined;
		}

		const embed = match[1] === '!';
		const { target: targetWithHeading, alias } = splitAlias(body);
		if (embed && isImageTarget(targetWithHeading)) {
			return undefined;
		}

		const headingSeparator = targetWithHeading.indexOf('#');
		const target = headingSeparator === -1
			? targetWithHeading
			: targetWithHeading.slice(0, headingSeparator);
		const heading = headingSeparator === -1
			? null
			: nullablePart(targetWithHeading.slice(headingSeparator + 1));
		if (!target && !heading) {
			return undefined;
		}
		const token: WikiLinkToken = {
			type: 'obsidian-wikilink',
			raw: match[0],
			target,
			heading,
			alias,
			embed,
		};
		return token as Tokens.Generic;
	},
};

function createMarked(): Marked {
	return new Marked({
		extensions: [calloutExtension, imageExtension, wikiLinkExtension],
	});
}

export function walkObsidianTokens(tokens: Token[]): {
	wikilinks: WikiLinkToken[];
	images: ImageEmbedToken[];
	callouts: CalloutToken[];
} {
	const wikilinks: WikiLinkToken[] = [];
	const images: ImageEmbedToken[] = [];
	const callouts: CalloutToken[] = [];

	createMarked().walkTokens(tokens, (token) => {
		switch (token.type) {
			case 'obsidian-wikilink':
				wikilinks.push(token as WikiLinkToken);
				break;
			case 'obsidian-image':
				images.push(token as ImageEmbedToken);
				break;
			case 'obsidian-callout':
				callouts.push(token as CalloutToken);
				break;
		}
	});

	return { wikilinks, images, callouts };
}

export function parseObsidianMarkdown(markdown: string): ParsedMarkdown {
	const tokens = createMarked().lexer(markdown);
	return {
		tokens,
		imageTokens: walkObsidianTokens(tokens).images,
	};
}
