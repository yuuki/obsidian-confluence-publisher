import type { Token, Tokens } from 'marked';
import { describe, expect, it } from 'vitest';
import {
	parseObsidianMarkdown,
	walkObsidianTokens,
} from './obsidian-marked-extension';

function findToken(tokens: Token[], type: string): Token | undefined {
	for (const token of tokens) {
		if (token.type === type) {
			return token;
		}
		if ('tokens' in token && Array.isArray(token.tokens)) {
			const child = findToken(token.tokens, type);
			if (child) {
				return child;
			}
		}
	}
	return undefined;
}

describe('Obsidian marked extension', () => {
	it('leaves wiki syntax in inline and fenced code untouched', () => {
		const markdown = [
			'`[[Inline]]` and [[Real#Heading|Shown]]',
			'',
			'```md',
			'[[Fenced]] ![[image.png]]',
			'```',
		].join('\n');

		const parsed = parseObsidianMarkdown(markdown);
		const walked = walkObsidianTokens(parsed.tokens);

		expect(walked.wikilinks).toMatchObject([
			{
				target: 'Real',
				heading: 'Heading',
				alias: 'Shown',
				embed: false,
			},
		]);
		expect(walked.images).toEqual([]);
		const codespan = findToken(parsed.tokens, 'codespan') as Tokens.Codespan;
		expect(codespan).toMatchObject({ raw: '`[[Inline]]`', text: '[[Inline]]' });
		const code = findToken(parsed.tokens, 'code') as Tokens.Code;
		expect(code.raw).toContain('[[Fenced]] ![[image.png]]');
		expect(code.text).toBe('[[Fenced]] ![[image.png]]');
	});

	it('separates adjacent callouts and walks nested wikilinks', () => {
		const markdown = [
			'> [!NOTE]- First',
			'> **bold** [[Page]]',
			'',
			'> [!WARNING]',
		].join('\n');

		const walked = walkObsidianTokens(parseObsidianMarkdown(markdown).tokens);

		expect(walked.callouts).toHaveLength(2);
		expect(walked.callouts[0]).toMatchObject({
			calloutType: 'NOTE',
			title: 'First',
			folded: true,
		});
		expect(walked.callouts[1]).toMatchObject({
			calloutType: 'WARNING',
			title: null,
			folded: null,
		});
		expect(walked.wikilinks).toMatchObject([{ target: 'Page' }]);
	});

	it('stops a callout before the next callout without a blank line', () => {
		const markdown = [
			'> [!NOTE]',
			'> first',
			'> [!WARNING]',
			'> second',
		].join('\n');

		const { callouts } = walkObsidianTokens(parseObsidianMarkdown(markdown).tokens);

		expect(callouts).toHaveLength(2);
		expect(callouts).toMatchObject([
			{ calloutType: 'NOTE' },
			{ calloutType: 'WARNING' },
		]);
	});

	it.each([
		{ opening: '```md', closing: '```' },
		{ opening: '~~~~', closing: '~~~~' },
	])('keeps callout-looking lines inside a $opening fence', ({ opening, closing }) => {
		const markdown = [
			'> [!NOTE] Code',
			`> ${opening}`,
			'> [!WARNING]',
			'> [[InsideCode]] ![[inside.png]]',
			`> ${closing}`,
			'> [[AfterCode]]',
		].join('\n');

		const parsed = parseObsidianMarkdown(markdown);
		const walked = walkObsidianTokens(parsed.tokens);

		expect(walked.callouts).toHaveLength(1);
		expect(walked.wikilinks).toMatchObject([{ target: 'AfterCode' }]);
		expect(walked.images).toEqual([]);
		const code = findToken(walked.callouts[0].tokens, 'code') as Tokens.Code;
		expect(code.raw).toContain('[[InsideCode]] ![[inside.png]]');
		expect(code.text).toContain('[[InsideCode]] ![[inside.png]]');
	});

	it('does not treat a backtick in the info string as a fence opening', () => {
		const markdown = [
			'> [!NOTE]',
			'> ```bad`info',
			'> [!WARNING]',
		].join('\n');

		const parsed = parseObsidianMarkdown(markdown);
		const topLevelCallouts = parsed.tokens.filter(
			(token) => token.type === 'obsidian-callout',
		);

		expect(topLevelCallouts).toHaveLength(2);
		expect(topLevelCallouts[0].raw).toBe('> [!NOTE]\n> ```bad`info\n');
		expect(topLevelCallouts[1].raw).toBe('> [!WARNING]');
	});

	it('does not close a callout fence with a tab after the delimiter', () => {
		const markdown = [
			'> [!NOTE] Code',
			'> ```md',
			'> [[InsideCode]] ![[inside.png]]',
			'> ```\t',
			'> [!WARNING]',
			'> ```',
			'> [[AfterCode]]',
		].join('\n');

		const parsed = parseObsidianMarkdown(markdown);
		const walked = walkObsidianTokens(parsed.tokens);

		expect(walked.callouts).toHaveLength(1);
		expect(walked.wikilinks).toMatchObject([{ target: 'AfterCode' }]);
		expect(walked.images).toEqual([]);
		const code = findToken(walked.callouts[0].tokens, 'code') as Tokens.Code;
		expect(code.raw).toContain('```\t\n[!WARNING]');
		expect(code.text).toContain('```\t\n[!WARNING]');
	});

	it('parses fold markers, omitted titles, and an empty body at EOF', () => {
		const markdown = [
			'> [!TIP]+',
			'> body',
			'',
			'> [!CAUTION]',
		].join('\n');

		const { callouts } = walkObsidianTokens(parseObsidianMarkdown(markdown).tokens);

		expect(callouts).toMatchObject([
			{ calloutType: 'TIP', title: null, folded: false },
			{ calloutType: 'CAUTION', title: null, folded: null, tokens: [] },
		]);
	});

	it('keeps an ordinary blockquote as a marked blockquote token', () => {
		const parsed = parseObsidianMarkdown('> ordinary **quote**');

		expect(parsed.tokens[0]).toMatchObject({ type: 'blockquote' });
		expect(walkObsidianTokens(parsed.tokens).callouts).toEqual([]);
	});

	it('splits image widths and alternative text', () => {
		const markdown = '![[assets/diagram.png|640]] ![[photo.JPG|Overview]]';
		const parsed = parseObsidianMarkdown(markdown);
		const { images, wikilinks } = walkObsidianTokens(parsed.tokens);

		expect(images).toMatchObject([
			{ target: 'assets/diagram.png', width: 640, alt: null },
			{ target: 'photo.JPG', width: null, alt: 'Overview' },
		]);
		expect(parsed.imageTokens).toEqual(images);
		expect(wikilinks).toEqual([]);
	});

	it('falls back to alt text when a numeric image width overflows', () => {
		const overflow = '9'.repeat(400);
		const markdown = [
			'![[normal.png|600]]',
			'![[zero.png|0]]',
			`![[overflow.png|${overflow}]]`,
		].join(' ');

		const { images } = walkObsidianTokens(parseObsidianMarkdown(markdown).tokens);

		expect(images).toMatchObject([
			{ target: 'normal.png', width: 600, alt: null },
			{ target: 'zero.png', width: 0, alt: null },
			{ target: 'overflow.png', width: null, alt: overflow },
		]);
		expect(images[2].width).not.toBe(Infinity);
		expect(Number.isFinite(images[2].width)).toBe(false);
	});

	it('rejects empty and malformed wikilink bodies but keeps a same-page heading', () => {
		const markdown = '[[]] ![[]] [[#]] [[|alias]] [[#Heading]]';
		const { wikilinks, images } = walkObsidianTokens(
			parseObsidianMarkdown(markdown).tokens,
		);

		expect(wikilinks).toMatchObject([
			{ target: '', heading: 'Heading', alias: null, embed: false },
		]);
		expect(images).toEqual([]);
	});

	it('does not let an unterminated wikilink swallow a nested valid image', () => {
		const markdown = '[[unterminated ![[also.png]]';
		const { wikilinks, images } = walkObsidianTokens(
			parseObsidianMarkdown(markdown).tokens,
		);

		expect(wikilinks).toEqual([]);
		expect(images).toMatchObject([{ target: 'also.png' }]);
	});

	it('treats note embeds as wikilinks and splits headings and aliases', () => {
		const markdown = '![[Note#Section|Preview]] [[Target#Heading|Shown]]';
		const { wikilinks, images } = walkObsidianTokens(
			parseObsidianMarkdown(markdown).tokens,
		);

		expect(wikilinks).toMatchObject([
			{
				target: 'Note',
				heading: 'Section',
				alias: 'Preview',
				embed: true,
			},
			{
				target: 'Target',
				heading: 'Heading',
				alias: 'Shown',
				embed: false,
			},
		]);
		expect(images).toEqual([]);
	});
});
