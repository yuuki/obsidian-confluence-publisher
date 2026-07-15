import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { ObsidianNoteRepository, parseNoteSource, selectPublishContent } from './note-repository';

describe('note source', () => {
	const raw = ['---', 'title: Example', '---', '# Body'].join('\n');

	it('keeps raw and body so stripFrontmatter controls published content', () => {
		const source = parseNoteSource('note.md', 'note', raw);
		expect(source.body).toBe('# Body');
		expect(selectPublishContent(source, true)).toBe('# Body');
		expect(selectPublishContent(source, false)).toBe(raw);
	});

	it('returns an issue instead of treating invalid YAML as body', () => {
		expect(() => parseNoteSource('bad.md', 'bad', '---\ninvalid: [\n---\nbody')).toThrow();
	});

	it('does not mistake Markdown thematic breaks for frontmatter', () => {
		for (const raw of ['--- horizontal rule', '----\nbody']) {
			const source = parseNoteSource('note.md', 'note', raw);
			expect(source.frontmatter).toEqual({});
			expect(source.body).toBe(raw);
		}
	});

	it('accepts an empty frontmatter block', () => {
		const source = parseNoteSource('note.md', 'note', '---\n---\nbody');
		expect(source.frontmatter).toEqual({});
		expect(source.body).toBe('body');
	});
});

it('replaces frontmatter metadata through the Obsidian adapter without rewriting note content', async () => {
	const file = { path: 'note.md', basename: 'note', extension: 'md' } as TFile;
	const frontmatter: Record<string, unknown> = {
		title: 'Keep',
		'confluence-page-id': 'legacy',
		'confluence-url': 'https://legacy.test/page',
	};
	let processedFile: TFile | null = null;
	const app = {
		vault: { getAbstractFileByPath: () => file },
		fileManager: {
			processFrontMatter: async (target: TFile, update: (value: Record<string, unknown>) => void) => {
				processedFile = target;
				update(frontmatter);
			},
		},
	} as unknown as App;
	const repository = new ObsidianNoteRepository(app);

	await repository.writePublication(file, {
		destinationId: 'dest-1',
		baseUrl: 'https://example.test/confluence',
		spaceKey: 'DOC',
		parentPageId: 'parent-1',
		pageId: 'page-1',
		pageUrl: 'https://example.test/confluence/pages/1',
	});

	expect(processedFile).toBe(file);
	expect(frontmatter.title).toBe('Keep');
	expect(frontmatter).not.toHaveProperty('confluence-page-id');
	expect(frontmatter).not.toHaveProperty('confluence-url');
	expect(frontmatter['confluence-publications']).toEqual({
		'dest-1': expect.objectContaining({ 'page-id': 'page-1' }),
	});
});
