import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
	InvalidFrontmatterError,
	ObsidianNoteRepository,
	parseNoteSource,
	selectPublishContent,
} from './note-repository';

describe('note source', () => {
	const raw = ['---', 'title: Example', '---', '# Body'].join('\n');

	it('keeps raw and body so stripFrontmatter controls published content', () => {
		const source = parseNoteSource('note.md', 'note', raw);
		expect(source.body).toBe('# Body');
		expect(selectPublishContent(source, true)).toBe('# Body');
		expect(selectPublishContent(source, false)).toBe(raw);
	});

	it('returns an issue instead of treating invalid YAML as body', () => {
		expect(() => parseNoteSource('bad.md', 'bad', '---\ninvalid: [\n---\nbody'))
			.toThrow(InvalidFrontmatterError);
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

it('selects the configured title and filters publications by the complete destination snapshot', async () => {
	const file = { path: 'note.md', basename: 'note', extension: 'md' } as TFile;
	const publication = {
		'base-url': 'https://example.test/confluence',
		'space-key': 'DOC',
		'parent-page-id': 'parent-1',
		'page-id': 'page-1',
		'page-url': 'https://example.test/confluence/pages/1',
	};
	const raw = `---\n${JSON.stringify({
		title: 'Different',
		'confluence-publications': { 'dest-1': publication },
	})}\n---\nbody`;
	const app = {
		vault: {
			getMarkdownFiles: () => [file],
			getAbstractFileByPath: () => file,
			cachedRead: async () => raw,
		},
	} as unknown as App;
	const repository = new ObsidianNoteRepository(app);
	const snapshot = {
		destinationId: 'dest-1',
		baseUrl: 'https://example.test/confluence',
		spaceKey: 'DOC',
		parentPageId: 'parent-1',
	};

	await expect(repository.listPublished(snapshot, 'filename')).resolves.toEqual([
		expect.objectContaining({ path: 'note.md', title: 'note' }),
	]);
	await expect(repository.listPublished({ ...snapshot, spaceKey: 'OTHER' }, 'frontmatter'))
		.resolves.toEqual([]);
});

it('skips only notes whose frontmatter cannot be parsed while listing publications', async () => {
	const valid = { path: 'valid.md', basename: 'valid', extension: 'md' } as TFile;
	const invalid = { path: 'bad.md', basename: 'bad', extension: 'md' } as TFile;
	const publication = {
		'base-url': 'https://example.test/confluence',
		'space-key': 'DOC',
		'parent-page-id': 'parent-1',
		'page-id': 'page-1',
		'page-url': 'https://example.test/confluence/pages/1',
	};
	const validRaw = `---\n${JSON.stringify({
		'confluence-publications': { 'dest-1': publication },
	})}\n---\nbody`;
	const app = {
		vault: {
			getMarkdownFiles: () => [valid, invalid],
			getAbstractFileByPath: (path: string) => path === valid.path ? valid : invalid,
			cachedRead: async (file: TFile) => file === valid
				? validRaw
				: '---\ninvalid: [\n---\nbody',
		},
	} as unknown as App;
	const repository = new ObsidianNoteRepository(app);
	const snapshot = {
		destinationId: 'dest-1', baseUrl: 'https://example.test/confluence',
		spaceKey: 'DOC', parentPageId: 'parent-1',
	};

	await expect(repository.listPublished(snapshot, 'filename')).resolves.toEqual([
		expect.objectContaining({ path: 'valid.md' }),
	]);
	await expect(repository.listPublicationCandidates('dest-1')).resolves.toEqual([valid]);
});

it('propagates vault I/O failures while listing publications', async () => {
	const file = { path: 'note.md', basename: 'note', extension: 'md' } as TFile;
	const app = {
		vault: {
			getMarkdownFiles: () => [file],
			getAbstractFileByPath: () => file,
			cachedRead: async () => { throw new Error('disk failed'); },
		},
	} as unknown as App;
	const repository = new ObsidianNoteRepository(app);

	await expect(repository.listPublished({
		destinationId: 'dest-1', baseUrl: 'https://example.test/confluence',
		spaceKey: 'DOC', parentPageId: 'parent-1',
	}, 'filename')).rejects.toThrow('disk failed');
});
