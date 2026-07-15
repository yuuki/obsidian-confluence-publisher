import { describe, expect, it, vi } from 'vitest';
import { buildPublicationPlan } from './publication-planner';
import type {
	Destination,
	EmbeddedImage,
	LegacyPublication,
	NoteCandidate,
	PageLookup,
	PublicationRecord,
	ResolvedPage,
} from './publication';

const baseUrl = 'https://example.test/confluence';
const destination: Destination = {
	id: 'dest-1',
	label: 'Docs',
	spaceKey: 'DOC',
	parentPageId: '42',
};

const resolvedImage: EmbeddedImage = {
	sourcePath: 'image.png',
	resolvedPath: 'assets/image.png',
	attachmentName: 'image.png',
	width: null,
};

function publication(pageId = '100'): PublicationRecord {
	return {
		destinationId: 'dest-1',
		baseUrl,
		spaceKey: 'DOC',
		parentPageId: '42',
		pageId,
		pageUrl: `${baseUrl}/pages/viewpage.action?pageId=${pageId}`,
	};
}

function legacyPublication(pageId = '100', pageUrl: string | null = null): LegacyPublication {
	return { pageId, pageUrl };
}

function note(options: {
	path?: string;
	title?: string;
	publication?: PublicationRecord | null;
	legacyPublication?: LegacyPublication | null;
	images?: NoteCandidate['images'];
} = {}): NoteCandidate {
	const path = options.path ?? 'note.md';
	return {
		path,
		basename: path.replace(/\.md$/, ''),
		raw: '# Note',
		frontmatter: {},
		body: '# Note',
		title: options.title ?? 'Note',
		publication: options.publication ?? null,
		legacyPublication: options.legacyPublication ?? null,
		images: options.images ?? [resolvedImage],
	};
}

function page(options: {
	id?: string;
	title?: string;
	spaceKey?: string;
	parentPageId?: string | null;
	ownership?: ResolvedPage['ownership'];
} = {}): ResolvedPage {
	return {
		id: options.id ?? '200',
		title: options.title ?? 'Note',
		spaceKey: options.spaceKey ?? 'DOC',
		parentPageId: options.parentPageId === undefined ? '42' : options.parentPageId,
		version: 3,
		webui: '/pages/viewpage.action?pageId=200',
		ownership: options.ownership === undefined
			? { schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'note.md' }
			: options.ownership,
	};
}

function lookup(options: {
	getPage?: (pageId: string, signal: AbortSignal) => Promise<ResolvedPage | null>;
	findPagesByTitle?: (spaceKey: string, title: string, signal: AbortSignal) => Promise<ResolvedPage[]>;
} = {}) {
	const getPage = vi.fn(options.getPage ?? (async () => null));
	const findPagesByTitle = vi.fn(options.findPagesByTitle ?? (async () => []));
	const repository: PageLookup = { getPage, findPagesByTitle };
	return { repository, getPage, findPagesByTitle };
}

async function build(notes: NoteCandidate[], repository: PageLookup, signal = new AbortController().signal) {
	return buildPublicationPlan({ baseUrl, destination, notes, repository, signal });
}

describe('buildPublicationPlan local preflight', () => {
	it('collects every local issue before any page lookup', async () => {
		const { repository, getPage, findPagesByTitle } = lookup();
		const mismatched = publication('different');
		mismatched.parentPageId = '99';
		const notes = [
			note({
				path: 'a.md',
				title: 'Duplicate',
				publication: publication('shared'),
				images: [{ sourcePath: 'missing.png', resolvedPath: null }],
			}),
			note({
				path: 'b.md',
				title: 'Duplicate',
				legacyPublication: legacyPublication('shared'),
			}),
			note({ path: 'c.md', publication: mismatched }),
		];

		const result = await buildPublicationPlan({
			baseUrl,
			destination: { ...destination, spaceKey: ' ', parentPageId: '' },
			notes,
			repository,
			signal: new AbortController().signal,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected local issues');
		expect(new Set(result.issues.map((issue) => issue.code))).toEqual(new Set([
			'invalid-destination',
			'duplicate-title',
			'duplicate-page-id',
			'unresolved-image',
			'destination-mismatch',
		]));
		expect(result.issues.filter((issue) => issue.code === 'duplicate-title').map((issue) => issue.path)).toEqual(['a.md', 'b.md']);
		expect(result.issues.filter((issue) => issue.code === 'duplicate-page-id').map((issue) => issue.path)).toEqual(['a.md', 'b.md']);
		expect(result.issues).toContainEqual(expect.objectContaining({
			code: 'unresolved-image',
			path: 'a.md',
			message: expect.stringContaining('missing.png'),
		}));
		expect(getPage).not.toHaveBeenCalled();
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});
});

describe('buildPublicationPlan remote resolution', () => {
	it('recovers a stale saved page ID through one exact owned title match', async () => {
		const candidate = note({ publication: publication('stale') });
		const recovered = page({ id: '201' });
		const { repository, getPage, findPagesByTitle } = lookup({
			getPage: async () => null,
			findPagesByTitle: async () => [recovered],
		});

		const result = await build([candidate], repository);

		expect(result).toEqual({
			ok: true,
			snapshot: {
				destinationId: 'dest-1',
				baseUrl,
				spaceKey: 'DOC',
				parentPageId: '42',
			},
			pages: [{ note: candidate, pageId: '201', operation: 'update', migrateLegacy: false, claimOwnership: false }],
		});
		expect(getPage).toHaveBeenCalledWith('stale', expect.any(AbortSignal));
		expect(findPagesByTitle).toHaveBeenCalledWith('DOC', 'Note', expect.any(AbortSignal));
	});

	it('updates one exact owned placeholder for an unpublished note', async () => {
		const candidate = note();
		const placeholder = page({ id: '202' });
		const { repository, getPage, findPagesByTitle } = lookup({ findPagesByTitle: async () => [placeholder] });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages).toEqual([
			{ note: candidate, pageId: '202', operation: 'update', migrateLegacy: false, claimOwnership: false },
		]);
		expect(getPage).not.toHaveBeenCalled();
		expect(findPagesByTitle).toHaveBeenCalledOnce();
	});

	it('recovers a stale legacy page ID without reclaiming exact ownership', async () => {
		const candidate = note({ legacyPublication: legacyPublication('stale') });
		const recovered = page({ id: '203' });
		const { repository } = lookup({
			getPage: async () => null,
			findPagesByTitle: async () => [recovered],
		});

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages).toEqual([
			{ note: candidate, pageId: '203', operation: 'update', migrateLegacy: true, claimOwnership: false },
		]);
	});

	it('creates an unpublished note only when the title search is empty', async () => {
		const candidate = note();
		const { repository } = lookup();

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages).toEqual([
			{ note: candidate, pageId: null, operation: 'create', migrateLegacy: false, claimOwnership: false },
		]);
	});

	it.each([
		['two matching candidates', [page({ id: '201' }), page({ id: '202' })]],
		['one matching and one unmarked candidate', [page({ id: '201' }), page({ id: '202', ownership: null })]],
		['one matching direct parent and one matching wrong parent', [page({ id: '201' }), page({ id: '202', parentPageId: '99' })]],
		['one unmarked candidate', [page({ ownership: null })]],
		['one candidate owned by another source', [page({ ownership: { schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'other.md' } })]],
		['one matching-ownership candidate in another parent', [page({ parentPageId: '99' })]],
		['one matching-ownership candidate in another space', [page({ spaceKey: 'OTHER' })]],
	] satisfies Array<[string, ResolvedPage[]]>)('rejects %s as ambiguous', async (_name, matches) => {
		const { repository } = lookup({ findPagesByTitle: async () => matches });

		const result = await build([note()], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([
			expect.objectContaining({ code: 'ambiguous-page', path: 'note.md' }),
		]);
	});

	it('updates and claims an unmarked legacy page at the exact location', async () => {
		const candidate = note({ legacyPublication: legacyPublication('100') });
		const { repository, findPagesByTitle } = lookup({ getPage: async () => page({ id: '100', ownership: null }) });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages).toEqual([
			{ note: candidate, pageId: '100', operation: 'update', migrateLegacy: true, claimOwnership: true },
		]);
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});

	it('resumes legacy migration when the explicit page already has expected ownership', async () => {
		const candidate = note({ legacyPublication: legacyPublication('100') });
		const { repository } = lookup({ getPage: async () => page({ id: '100' }) });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages[0]).toEqual({
			note: candidate,
			pageId: '100',
			operation: 'update',
			migrateLegacy: true,
			claimOwnership: false,
		});
	});

	it('updates a new-format explicit page with expected ownership', async () => {
		const candidate = note({ publication: publication('100') });
		const { repository } = lookup({ getPage: async () => page({ id: '100' }) });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected a plan');
		expect(result.pages[0]).toEqual({
			note: candidate,
			pageId: '100',
			operation: 'update',
			migrateLegacy: false,
			claimOwnership: false,
		});
	});

	it.each([
		['unmarked', null],
		['owned by another destination', { schemaVersion: 1, destinationId: 'dest-2', sourcePath: 'note.md' }],
		['owned by another source', { schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'other.md' }],
	] satisfies Array<[string, ResolvedPage['ownership']]>)('rejects a new-format explicit page that is %s', async (_name, ownership) => {
		const { repository, findPagesByTitle } = lookup({ getPage: async () => page({ ownership }) });

		const result = await build([note({ publication: publication() })], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([expect.objectContaining({ code: 'destination-mismatch', path: 'note.md' })]);
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});

	it.each([
		['another destination', { schemaVersion: 1, destinationId: 'dest-2', sourcePath: 'note.md' }],
		['another source', { schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'other.md' }],
	] satisfies Array<[string, ResolvedPage['ownership']]>)('rejects a legacy explicit page owned by %s', async (_name, ownership) => {
		const { repository } = lookup({ getPage: async () => page({ ownership }) });

		const result = await build([note({ legacyPublication: legacyPublication() })], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([expect.objectContaining({ code: 'destination-mismatch' })]);
	});

	it.each([
		['new-format', note({ publication: publication() })],
		['legacy', note({ legacyPublication: legacyPublication() })],
	] satisfies Array<[string, NoteCandidate]>)('rejects an explicit %s page in another direct parent', async (_name, candidate) => {
		const { repository, findPagesByTitle } = lookup({ getPage: async () => page({ parentPageId: '99' }) });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([expect.objectContaining({ code: 'destination-mismatch' })]);
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});

	it('rejects an explicit page in another space without title fallback', async () => {
		const { repository, findPagesByTitle } = lookup({ getPage: async () => page({ spaceKey: 'OTHER' }) });

		const result = await build([note({ publication: publication() })], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([expect.objectContaining({ code: 'destination-mismatch' })]);
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});

	it('collects remote issues for every note instead of stopping at the first', async () => {
		const first = note({ path: 'first.md', title: 'First' });
		const second = note({ path: 'second.md', title: 'Second' });
		const { repository, findPagesByTitle } = lookup({
			findPagesByTitle: async (_spaceKey, title) => [page({ title, ownership: null })],
		});

		const result = await build([first, second], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected issues');
		expect(result.issues).toEqual([
			expect.objectContaining({ code: 'ambiguous-page', path: 'first.md' }),
			expect.objectContaining({ code: 'ambiguous-page', path: 'second.md' }),
		]);
		expect(findPagesByTitle).toHaveBeenCalledTimes(2);
	});

	it.each([
		['another origin', 'https://other.test/confluence/pages/viewpage.action?pageId=100'],
		['another context path', 'https://example.test/other/pages/viewpage.action?pageId=100'],
		['a deceptive path prefix', 'https://example.test/confluence-other/pages/viewpage.action?pageId=100'],
		['an invalid URL', 'not a URL'],
	])('rejects a legacy URL with %s before lookup', async (_name, pageUrl) => {
		const { repository, getPage, findPagesByTitle } = lookup();

		const result = await build([note({ legacyPublication: legacyPublication('100', pageUrl) })], repository);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an issue');
		expect(result.issues).toEqual([expect.objectContaining({ code: 'destination-mismatch' })]);
		expect(getPage).not.toHaveBeenCalled();
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});

	it('allows a legacy URL under the configured origin and context path', async () => {
		const candidate = note({
			legacyPublication: legacyPublication('100', 'https://example.test/confluence/pages/viewpage.action?pageId=100'),
		});
		const { repository, getPage } = lookup({ getPage: async () => page({ id: '100', ownership: null }) });

		const result = await build([candidate], repository);

		expect(result.ok).toBe(true);
		expect(getPage).toHaveBeenCalledOnce();
	});

	it('forwards the same signal to every saved-ID and title lookup', async () => {
		const signal = new AbortController().signal;
		const { repository, getPage, findPagesByTitle } = lookup();

		await build([note({ publication: publication('stale') })], repository, signal);

		expect(getPage).toHaveBeenCalledWith('stale', signal);
		expect(findPagesByTitle).toHaveBeenCalledWith('DOC', 'Note', signal);
	});

	it('throws AbortError before lookup when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const { repository, getPage, findPagesByTitle } = lookup();

		await expect(build([note()], repository, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(getPage).not.toHaveBeenCalled();
		expect(findPagesByTitle).not.toHaveBeenCalled();
	});
});
