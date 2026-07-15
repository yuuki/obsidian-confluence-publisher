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
