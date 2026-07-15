import { describe, expect, it, vi } from 'vitest';
import type {
	Destination,
	NoteInput,
	PublishRepository,
	ResolvedPage,
} from './domain/publication';
import type { NoteFileRef, NoteRepository } from './obsidian/note-repository';
import { InvalidFrontmatterError } from './obsidian/note-repository';
import { createCleanupSignal, mimeTypeForPath, Publisher } from './publisher';

interface FakeOptions {
	createPageFailureFor?: string;
	ownershipFailureFor?: string;
	attachmentFailureForPage?: string;
	deleteFailureFor?: string;
	abortOwnershipFor?: string;
	onOwnershipStart?: () => void;
	legacyPage?: boolean;
	updateFailureForPage?: string;
	webui?: string | null;
}

interface DependencyOptions {
	bodyByPath?: Record<string, string>;
	legacyPaths?: string[];
	published?: Awaited<ReturnType<NoteRepository['listPublished']>>;
	titleSource?: 'frontmatter' | 'filename';
}

describe('Publisher', () => {
	it('does not start content updates when one page creation fails', async () => {
		const remote = fakeRepository({ createPageFailureFor: 'Second' });
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md'), file('second.md')], destination(), signal(),
		));

		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events).toContainEqual(expect.objectContaining({ type: 'failed', phase: 'page-resolution' }));
		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 2 });
	});

	it('loads the vault link map before starting any remote write', async () => {
		const remote = fakeRepository();
		const deps = dependencies(remote);
		vi.mocked(deps.notes.listPublished).mockRejectedValue(new Error('vault read failed'));
		const events = await collect(new Publisher(deps).publish(
			[file('first.md'), file('second.md')], destination(), signal(),
		));

		expect(remote.createPage).not.toHaveBeenCalled();
		expect(remote.setPageOwnership).not.toHaveBeenCalled();
		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 2 });
	});

	it('keeps selected invalid frontmatter as a preflight failure', async () => {
		const remote = fakeRepository();
		const deps = dependencies(remote);
		vi.mocked(deps.notes.read).mockImplementation(async (ref) => {
			if (ref.path === 'bad.md') throw new InvalidFrontmatterError(ref.path);
			return {
				path: ref.path, basename: ref.basename, raw: '# valid', body: '# valid',
				frontmatter: { title: 'Valid' },
			};
		});
		const events = await collect(new Publisher(deps).publish(
			[file('valid.md'), file('bad.md')], destination(), signal(),
		));

		expect(remote.findPagesByTitle).not.toHaveBeenCalled();
		expect(remote.createPage).not.toHaveBeenCalled();
		expect(events).toContainEqual(expect.objectContaining({
			type: 'failed', title: 'bad.md', phase: 'preflight',
		}));
		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 2 });
	});

	it('counts pages instead of repeated unresolved-image issues', async () => {
		const remote = fakeRepository();
		const deps = dependencies(remote, { bodyByPath: { 'first.md': '![[a.png]] ![[b.png]]' } });
		vi.mocked(deps.notes.resolveLink).mockReturnValue(null);
		const events = await collect(new Publisher(deps).publish(
			[file('first.md')], destination(), signal(),
		));

		expect(events.filter((event) => event.type === 'failed')).toHaveLength(2);
		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 1 });
	});

	it('counts all selected pages when a global preflight issue stops publication', async () => {
		const events = await collect(new Publisher(dependencies(fakeRepository())).publish(
			[file('first.md'), file('second.md')],
			{ ...destination(), spaceKey: '' },
			signal(),
		));

		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 2 });
	});

	it('finishes ownership for every created page before any content update', async () => {
		const remote = fakeRepository();
		await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md'), file('second.md')], destination(), signal(),
		));

		const creates = vi.mocked(remote.createPage).mock.invocationCallOrder;
		const ownerships = vi.mocked(remote.setPageOwnership).mock.invocationCallOrder;
		const updates = vi.mocked(remote.updatePage).mock.invocationCallOrder;
		expect(creates[0]).toBeLessThan(ownerships[0]);
		expect(ownerships[0]).toBeLessThan(creates[1]);
		expect(creates[1]).toBeLessThan(ownerships[1]);
		expect(ownerships[1]).toBeLessThan(updates[0]);
		expect(remote.setPageOwnership).toHaveBeenNthCalledWith(
			1,
			'page-1',
			{ schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'first.md' },
			expect.any(AbortSignal),
		);
	});

	it('performs no remote calls when image preflight fails', async () => {
		const remote = fakeRepository();
		const deps = dependencies(remote);
		vi.mocked(deps.notes.resolveLink).mockReturnValue(null);
		const events = await collect(new Publisher(deps).publish(
			[file('first.md')], destination(), signal(),
		));

		expect(remote.getPage).not.toHaveBeenCalled();
		expect(remote.findPagesByTitle).not.toHaveBeenCalled();
		expect(remote.createPage).not.toHaveBeenCalled();
		expect(events).toContainEqual(expect.objectContaining({ type: 'failed', phase: 'preflight' }));
	});

	it('continues other pages after one attachment update fails', async () => {
		const remote = fakeRepository({ attachmentFailureForPage: 'page-1' });
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md'), file('second.md')], destination(), signal(),
		));

		expect(remote.updatePage).toHaveBeenCalledWith(
			'page-2', expect.anything(), expect.anything(), expect.anything(), expect.anything(),
		);
		expect(events[events.length - 1]).toMatchObject({ type: 'complete', succeeded: 1, failed: 1 });
	});

	it('rolls back only the page whose ownership creation fails', async () => {
		const remote = fakeRepository({ ownershipFailureFor: 'Second' });
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md'), file('second.md')], destination(), signal(),
		));

		expect(remote.deletePage).toHaveBeenCalledTimes(1);
		expect(remote.deletePage).toHaveBeenCalledWith('page-2', expect.any(AbortSignal));
		expect(remote.deletePage).not.toHaveBeenCalledWith('page-1', expect.any(AbortSignal));
		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events).toContainEqual(expect.objectContaining({ type: 'failed', phase: 'page-resolution' }));
	});

	it('reports the exact page id and fallback URL in one event when ownership and rollback both fail', async () => {
		const remote = fakeRepository({ ownershipFailureFor: 'First', deleteFailureFor: 'page-1' });
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md')], destination(), signal(),
		));

		const failures = events.filter((event) => event.type === 'failed');
		expect(failures).toHaveLength(1);
		expect(failures[0].error).toContain('page-1');
		expect(failures[0].error).toContain(
			'https://example.test/confluence/pages/viewpage.action?pageId=page-1',
		);
	});

	it('does not delete an existing legacy page when ownership creation fails', async () => {
		const remote = fakeRepository({ legacyPage: true, ownershipFailureFor: 'First' });
		await collect(new Publisher(dependencies(remote, { legacyPaths: ['first.md'] })).publish(
			[file('first.md')], destination(), signal(),
		));

		expect(remote.deletePage).not.toHaveBeenCalled();
		expect(remote.updatePage).not.toHaveBeenCalled();
	});

	it('uses one independent bounded cleanup after cancel interrupts ownership creation', async () => {
		const controller = new AbortController();
		const remote = fakeRepository({
			abortOwnershipFor: 'First',
			onOwnershipStart: () => controller.abort(),
		});
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md'), file('second.md')], destination(), controller.signal,
		));

		expect(remote.deletePage).toHaveBeenCalledTimes(1);
		expect(vi.mocked(remote.deletePage).mock.calls[0][1]).not.toBe(controller.signal);
		expect(remote.createPage).toHaveBeenCalledTimes(1);
		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events[events.length - 1]).toMatchObject({ type: 'cancelled' });
	});

	it('reports the orphan id and URL if cancel cleanup also fails', async () => {
		const controller = new AbortController();
		const remote = fakeRepository({
			abortOwnershipFor: 'First',
			deleteFailureFor: 'page-1',
			onOwnershipStart: () => controller.abort(),
		});
		const events = await collect(new Publisher(dependencies(remote)).publish(
			[file('first.md')], destination(), controller.signal,
		));

		const failures = events.filter((event) => event.type === 'failed');
		expect(failures).toHaveLength(1);
		expect(failures[0].error).toContain('page-1');
		expect(failures[0].error).toContain(
			'https://example.test/confluence/pages/viewpage.action?pageId=page-1',
		);
		expect(remote.deletePage).toHaveBeenCalledTimes(1);
		expect(events[events.length - 1]).toMatchObject({ type: 'cancelled' });
	});

	it('does not start an attachment request when cancellation occurs during local binary read', async () => {
		const controller = new AbortController();
		const remote = fakeRepository();
		const deps = dependencies(remote);
		vi.mocked(deps.notes.readBinary).mockImplementation(async () => {
			controller.abort();
			return new ArrayBuffer(1);
		});
		const events = await collect(new Publisher(deps).publish(
			[file('first.md')], destination(), controller.signal,
		));

		expect(remote.putAttachment).not.toHaveBeenCalled();
		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events[events.length - 1]).toMatchObject({ type: 'cancelled' });
	});

	it('includes unselected published notes in the wikilink map', async () => {
		const remote = fakeRepository();
		mockPublishedPage(remote, 'third.md', 'Third page');
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{
				path: 'third.md',
				title: 'Third page',
				record: {
					destinationId: 'dest-1',
					baseUrl: 'https://example.test/confluence',
					spaceKey: 'DOC',
					parentPageId: 'parent-1',
					pageId: 'page-3',
					pageUrl: 'https://example.test/confluence/pages/3',
				},
			}],
		});
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(vi.mocked(remote.updatePage).mock.calls[0][2]).toContain('ri:content-title="Third page"');
	});

	it('uses the verified remote title when an unselected published note was renamed locally', async () => {
		const remote = fakeRepository();
		vi.mocked(remote.getPage).mockResolvedValueOnce({
			id: 'page-3',
			title: 'Old remote title',
			spaceKey: 'DOC',
			parentPageId: 'parent-1',
			version: 1,
			webui: null,
			ownership: {
				schemaVersion: 1,
				destinationId: 'dest-1',
				sourcePath: 'third.md',
			},
		});
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{
				path: 'third.md',
				title: 'New local title',
				record: publicationRecord(),
			}],
		});

		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(vi.mocked(remote.updatePage).mock.calls[0][2])
			.toContain('ri:content-title="Old remote title"');
	});

	it('uses the configured title source while discovering an unselected published note', async () => {
		const remote = fakeRepository();
		mockPublishedPage(remote, 'note.md', 'note');
		const deps = dependencies(remote, {
			titleSource: 'filename',
			bodyByPath: { 'first.md': '[[note]]' },
			published: [{
				path: 'note.md',
				title: 'Different',
				record: publicationRecord(),
			}],
		});
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(deps.notes.listPublished).toHaveBeenCalledWith(
			expect.objectContaining({ destinationId: 'dest-1' }),
			'filename',
		);
		expect(vi.mocked(remote.updatePage).mock.calls[0][2]).toContain('ri:content-title="note"');
	});

	it.each([
		['base URL', { baseUrl: 'https://other.test/confluence' }],
		['space key', { spaceKey: 'OTHER' }],
		['parent page', { parentPageId: 'other-parent' }],
	])('excludes an unselected publication with a mismatched %s', async (_label, override) => {
		const remote = fakeRepository();
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{
				path: 'third.md',
				title: 'Third page',
				record: { ...publicationRecord(), ...override },
			}],
		});
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(vi.mocked(remote.updatePage).mock.calls[0][2]).not.toContain('<ri:page');
	});

	it('keeps an unselected publication whose complete snapshot matches', async () => {
		const remote = fakeRepository();
		mockPublishedPage(remote, 'third.md', 'Third page');
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{ path: 'third.md', title: 'Third page', record: publicationRecord() }],
		});
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(vi.mocked(remote.updatePage).mock.calls[0][2]).toContain('ri:content-title="Third page"');
	});

	it('uses the normalized destination space key during second-pass conversion', async () => {
		const remote = fakeRepository();
		mockPublishedPage(remote, 'third.md', 'Third page');
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{ path: 'third.md', title: 'Third page', record: publicationRecord() }],
		});
		await collect(new Publisher(deps).publish(
			[file('first.md')], { ...destination(), spaceKey: ' DOC ' }, signal(),
		));

		const storage = vi.mocked(remote.updatePage).mock.calls[0][2];
		expect(storage).toContain('ri:space-key="DOC"');
		expect(storage).not.toContain('ri:space-key=" DOC "');
	});

	it.each([
		['missing', null],
		['wrong page id', verifiedPublishedPage('third.md', 'Third page', { id: 'other-page' })],
		['wrong space', verifiedPublishedPage('third.md', 'Third page', { spaceKey: 'OTHER' })],
		['wrong parent', verifiedPublishedPage('third.md', 'Third page', { parentPageId: 'other-parent' })],
		['unowned', verifiedPublishedPage('third.md', 'Third page', { ownership: null })],
		['wrong destination ownership', verifiedPublishedPage('third.md', 'Third page', {
			ownership: { schemaVersion: 1, destinationId: 'other-destination', sourcePath: 'third.md' },
		})],
		['wrong source ownership', verifiedPublishedPage('third.md', 'Third page', {
			ownership: { schemaVersion: 1, destinationId: 'dest-1', sourcePath: 'other.md' },
		})],
	] as const)('omits an unselected published link when its remote page is %s', async (_label, page) => {
		const remote = fakeRepository();
		vi.mocked(remote.getPage).mockResolvedValueOnce(page);
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{ path: 'third.md', title: 'Third page', record: publicationRecord() }],
		});

		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(vi.mocked(remote.updatePage).mock.calls[0][2]).not.toContain('<ri:page');
	});

	it('stops before all writes when remote validation of an unselected page fails', async () => {
		const remote = fakeRepository();
		vi.mocked(remote.getPage).mockRejectedValue(new Error('remote lookup failed'));
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[third]]' },
			published: [{ path: 'third.md', title: 'Third page', record: publicationRecord() }],
		});

		const events = await collect(new Publisher(deps).publish(
			[file('first.md')], destination(), signal(),
		));

		expect(remote.createPage).not.toHaveBeenCalled();
		expect(remote.setPageOwnership).not.toHaveBeenCalled();
		expect(remote.updatePage).not.toHaveBeenCalled();
		expect(events).toContainEqual(expect.objectContaining({
			type: 'failed', phase: 'preflight', error: 'remote lookup failed',
		}));
	});

	it('uses the planned title for a selected page without validating its link-map record', async () => {
		const remote = fakeRepository();
		const deps = dependencies(remote, {
			bodyByPath: { 'first.md': '[[first]]' },
			published: [{ path: 'first.md', title: 'Stale title', record: {
				...publicationRecord(), pageId: 'stale-page',
			} }],
		});
		vi.mocked(deps.notes.resolveLink).mockReturnValue('first.md');

		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(remote.createPage).toHaveBeenCalled();
		expect(vi.mocked(remote.createPage).mock.invocationCallOrder[0])
			.toBeLessThan(vi.mocked(remote.getPage).mock.invocationCallOrder[0]);
		expect(vi.mocked(remote.updatePage).mock.calls[0][2])
			.toContain('ri:content-title="First"');
	});

	it('writes publication metadata only after a successful page update', async () => {
		const remote = fakeRepository({ updateFailureForPage: 'page-1' });
		const deps = dependencies(remote);
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));
		expect(deps.notes.writePublication).not.toHaveBeenCalled();

		const successfulRemote = fakeRepository();
		const successfulDeps = dependencies(successfulRemote);
		await collect(new Publisher(successfulDeps).publish([file('first.md')], destination(), signal()));
		expect(vi.mocked(successfulRemote.updatePage).mock.invocationCallOrder[0])
			.toBeLessThan((successfulDeps.notes.writePublication as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
	});

	it('reports a local metadata write failure even if abort happens after the remote update', async () => {
		const controller = new AbortController();
		const remote = fakeRepository();
		const deps = dependencies(remote);
		vi.mocked(deps.notes.writePublication).mockImplementation(async () => {
			controller.abort();
			throw new Error('local metadata write failed');
		});
		const events = await collect(new Publisher(deps).publish(
			[file('first.md')], destination(), controller.signal,
		));

		expect(remote.updatePage).toHaveBeenCalledTimes(1);
		expect(events).toContainEqual(expect.objectContaining({
			type: 'failed', phase: 'content-update', error: 'local metadata write failed',
		}));
		expect(events[events.length - 1]).toEqual({ type: 'complete', succeeded: 0, failed: 1 });
	});

	it.each([
		['/display/DOC/First', 'https://example.test/confluence/display/DOC/First'],
		['/confluence/display/DOC/First', 'https://example.test/confluence/display/DOC/First'],
		['https://evil.test/page', 'https://example.test/confluence/pages/viewpage.action?pageId=page-1'],
		['https://user:secret@example.test/page', 'https://example.test/confluence/pages/viewpage.action?pageId=page-1'],
		['../../admin', 'https://example.test/confluence/pages/viewpage.action?pageId=page-1'],
	])('stores only a safe page URL for webui %s', async (webui, expected) => {
		const remote = fakeRepository({ webui });
		const deps = dependencies(remote);
		await collect(new Publisher(deps).publish([file('first.md')], destination(), signal()));

		expect(deps.notes.writePublication).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ pageUrl: expected }),
		);
	});
});

it('aborts the cleanup signal at exactly five seconds', () => {
	vi.useFakeTimers();
	try {
		const cleanup = createCleanupSignal();
		expect(cleanup.signal.aborted).toBe(false);
		vi.advanceTimersByTime(4_999);
		expect(cleanup.signal.aborted).toBe(false);
		vi.advanceTimersByTime(1);
		expect(cleanup.signal.aborted).toBe(true);
		cleanup.dispose();
	} finally {
		vi.useRealTimers();
	}
});

it('disposes the cleanup timer before it aborts', () => {
	vi.useFakeTimers();
	try {
		const cleanup = createCleanupSignal();
		vi.advanceTimersByTime(4_999);
		cleanup.dispose();
		vi.advanceTimersByTime(5_000);
		expect(cleanup.signal.aborted).toBe(false);
	} finally {
		vi.useRealTimers();
	}
});

it.each([
	['image.png', 'image/png'],
	['image.JPG', 'image/jpeg'],
	['image.jpeg', 'image/jpeg'],
	['image.gif', 'image/gif'],
	['image.svg', 'image/svg+xml'],
	['image.webp', 'image/webp'],
	['image.bin', 'application/octet-stream'],
])('selects the attachment MIME type for %s', (path, expected) => {
	expect(mimeTypeForPath(path)).toBe(expected);
});

function file(path: string): NoteFileRef {
	const basename = path.slice(0, path.lastIndexOf('.'));
	return { path, basename, extension: 'md' };
}

function destination(): Destination {
	return { id: 'dest-1', label: 'Docs', spaceKey: 'DOC', parentPageId: 'parent-1' };
}

function signal(): AbortSignal {
	return new AbortController().signal;
}

function dependencies(remote: PublishRepository, options: DependencyOptions = {}): {
	notes: NoteRepository;
	repository: PublishRepository;
	settings: { confluenceUrl: string; stripFrontmatter: boolean; titleSource: 'frontmatter' | 'filename' };
} {
	const notes: NoteRepository = {
		read: vi.fn(async (ref: NoteFileRef): Promise<NoteInput> => ({
			path: ref.path,
			basename: ref.basename,
			raw: options.bodyByPath?.[ref.path] ?? `![[${ref.basename}.png]]`,
			frontmatter: {
				title: ref.basename[0].toUpperCase() + ref.basename.slice(1),
				...(options.legacyPaths?.includes(ref.path)
					? { 'confluence-page-id': 'legacy-1' }
					: {}),
			},
			body: options.bodyByPath?.[ref.path] ?? `![[${ref.basename}.png]]`,
		})),
		listMarkdownFiles: vi.fn(() => []),
		listPublished: vi.fn(async (_destination, titleSource) =>
			(options.published ?? []).map((entry) => ({
				...entry,
				title: titleSource === 'filename'
					? entry.path.slice(entry.path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
					: entry.title,
			})),
		),
		listPublicationCandidates: vi.fn(async () => []),
		resolveLink: vi.fn((target: string) => {
			if (target === 'third') return 'third.md';
			if (target === 'note') return 'note.md';
			return `assets/${target}`;
		}),
		readBinary: vi.fn(async () => new ArrayBuffer(1)),
		writePublication: vi.fn(async () => undefined),
	};
	return {
		notes,
		repository: remote,
		settings: {
			confluenceUrl: 'https://example.test/confluence',
			stripFrontmatter: true,
			titleSource: options.titleSource ?? 'frontmatter',
		},
	};
}

function publicationRecord() {
	return {
		destinationId: 'dest-1',
		baseUrl: 'https://example.test/confluence',
		spaceKey: 'DOC',
		parentPageId: 'parent-1',
		pageId: 'page-3',
		pageUrl: 'https://example.test/confluence/pages/3',
	};
}

function verifiedPublishedPage(
	sourcePath: string,
	title: string,
	override: Partial<ResolvedPage> = {},
): ResolvedPage {
	return {
		id: 'page-3',
		title,
		spaceKey: 'DOC',
		parentPageId: 'parent-1',
		version: 1,
		webui: null,
		ownership: { schemaVersion: 1, destinationId: 'dest-1', sourcePath },
		...override,
	};
}

function mockPublishedPage(
	remote: PublishRepository & Record<string, ReturnType<typeof vi.fn>>,
	sourcePath: string,
	title: string,
): void {
	vi.mocked(remote.getPage).mockResolvedValueOnce(verifiedPublishedPage(sourcePath, title));
}

function fakeRepository(options: FakeOptions = {}): PublishRepository & Record<string, ReturnType<typeof vi.fn>> {
	const pages = new Map<string, ResolvedPage>();
	if (options.legacyPage) {
		pages.set('legacy-1', {
			id: 'legacy-1', title: 'First', spaceKey: 'DOC', parentPageId: 'parent-1',
			version: 1, webui: null, ownership: null,
		});
	}
	let nextPage = 0;
	const repository = {
		getPage: vi.fn(async (pageId: string) => pages.get(pageId) ?? null),
		findPagesByTitle: vi.fn(async () => []),
		createPage: vi.fn(async (
			spaceKey: string,
			parentPageId: string,
			title: string,
		) => {
			if (title === options.createPageFailureFor) throw new Error('create failed');
			const id = `page-${++nextPage}`;
			const page: ResolvedPage = {
				id,
				title,
				spaceKey,
				parentPageId,
				version: 1,
				webui: options.webui ?? null,
				ownership: null,
			};
			pages.set(id, page);
			return page;
		}),
		setPageOwnership: vi.fn(async (_pageId: string, ownership: unknown) => {
			const title = [...pages.values()].find((page) => page.id === _pageId)?.title;
			if (title === options.abortOwnershipFor) {
				options.onOwnershipStart?.();
				throw new DOMException('cancelled', 'AbortError');
			}
			if (title === options.ownershipFailureFor) throw new Error('ownership failed');
			void ownership;
		}),
		deletePage: vi.fn(async (pageId: string) => {
			if (pageId === options.deleteFailureFor) throw new Error('delete failed');
			pages.delete(pageId);
		}),
		updatePage: vi.fn(async (pageId: string) => {
			if (pageId === options.updateFailureForPage) throw new Error('update failed');
		}),
		putAttachment: vi.fn(async (pageId: string) => {
			if (pageId === options.attachmentFailureForPage) throw new Error('attachment failed');
			return 'created' as const;
		}),
	};
	return repository as PublishRepository & Record<string, ReturnType<typeof vi.fn>>;
}

async function collect<T>(events: AsyncGenerator<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const event of events) result.push(event);
	return result;
}
