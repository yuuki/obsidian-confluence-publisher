import {
	destinationSnapshot,
	isSamePublicationDestination,
	type Destination,
	type DestinationSnapshot,
	type NoteCandidate,
	type PageLookup,
	type PageOwnership,
	type PlanIssue,
	type PlannedPage,
	type PublicationPlanResult,
	type ResolvedPage,
} from './publication';

interface PlannerInput {
	baseUrl: string;
	destination: Destination;
	notes: NoteCandidate[];
	repository: PageLookup;
	signal: AbortSignal;
	parentPageId?: string;
}

export async function buildPublicationPlan(input: PlannerInput): Promise<PublicationPlanResult> {
	const { snapshot, issues: localIssues } = validatePublicationPlanInput(input.baseUrl, input.destination, input.notes);
	const parentPageId = input.parentPageId ?? snapshot.parentPageId;
	if (localIssues.length > 0) return { ok: false, issues: localIssues };

	const pages: PlannedPage[] = [];
	const remoteIssues: PlanIssue[] = [];
	for (const note of input.notes) {
		input.signal.throwIfAborted();
		const resolution = await resolveNote(snapshot, parentPageId, note, input.repository, input.signal);
		if ('issue' in resolution) remoteIssues.push(resolution.issue);
		else pages.push(resolution.page);
	}

	return remoteIssues.length > 0
		? { ok: false, issues: remoteIssues }
		: { ok: true, snapshot, pages };
}

export function validatePublicationPlanInput(
	baseUrl: string,
	destination: Destination,
	notes: NoteCandidate[],
): { snapshot: DestinationSnapshot; issues: PlanIssue[] } {
	const snapshot = destinationSnapshot(baseUrl, destination);
	return { snapshot, issues: validateLocalInput(snapshot, notes) };
}

function validateLocalInput(snapshot: DestinationSnapshot, notes: NoteCandidate[]): PlanIssue[] {
	const issues: PlanIssue[] = [];
	if (snapshot.spaceKey === '' || snapshot.parentPageId === '') {
		issues.push({
			code: 'invalid-destination',
			path: null,
			message: '公開先のスペースキーと親ページIDを入力してください。',
		});
	}

	issues.push(...collectDuplicates(notes, (note) => note.title.trim(), 'duplicate-title', '同じ公開タイトル'));
	issues.push(...collectDuplicates(
		notes,
		(note) => note.publication?.pageId ?? note.legacyPublication?.pageId ?? '',
		'duplicate-page-id',
		'同じConfluenceページID',
	));

	for (const note of notes) {
		for (const image of note.images) {
			if (image.resolvedPath === null) {
				issues.push({
					code: 'unresolved-image',
					path: note.path,
					message: `画像「${image.sourcePath}」を解決できません。リンク先を確認してください。`,
				});
			}
		}

		if (note.publication !== null && !isSamePublicationDestination(note.publication, snapshot)) {
			issues.push({
				code: 'destination-mismatch',
				path: note.path,
				message: '保存済みの公開先情報が、選択中の公開先と一致しません。',
			});
		}

		const legacyPageUrl = note.legacyPublication?.pageUrl;
		if (legacyPageUrl !== null
			&& legacyPageUrl !== undefined
			&& !isUrlWithinBase(legacyPageUrl, snapshot.baseUrl)) {
			issues.push({
				code: 'destination-mismatch',
				path: note.path,
				message: '旧形式のConfluence URLが、選択中のベースURLと一致しません。',
			});
		}
	}

	return issues;
}

function collectDuplicates(
	notes: NoteCandidate[],
	valueOf: (note: NoteCandidate) => string,
	code: 'duplicate-title' | 'duplicate-page-id',
	description: string,
): PlanIssue[] {
	const groups = new Map<string, NoteCandidate[]>();
	for (const note of notes) {
		const value = valueOf(note);
		if (value === '') continue;
		const group = groups.get(value);
		if (group === undefined) groups.set(value, [note]);
		else group.push(note);
	}

	const issues: PlanIssue[] = [];
	for (const [value, group] of groups) {
		if (group.length < 2) continue;
		const paths = group.map((note) => note.path).join(', ');
		for (const note of group) {
			issues.push({
				code,
				path: note.path,
				message: `${description}「${value}」が重複しています: ${paths}`,
			});
		}
	}
	return issues;
}

function isUrlWithinBase(pageUrl: string, baseUrl: string): boolean {
	try {
		const page = new URL(pageUrl);
		const base = new URL(baseUrl);
		if (page.origin !== base.origin) return false;
		const basePath = base.pathname.replace(/\/+$/, '');
		return page.pathname === basePath || page.pathname.startsWith(`${basePath}/`);
	} catch {
		return false;
	}
}

async function resolveNote(
	snapshot: DestinationSnapshot,
	parentPageId: string,
	note: NoteCandidate,
	repository: PageLookup,
	signal: AbortSignal,
): Promise<{ page: PlannedPage } | { issue: PlanIssue }> {
	const isLegacy = note.publication === null && note.legacyPublication !== null;
	const savedPageId = note.publication?.pageId ?? note.legacyPublication?.pageId ?? null;
	if (savedPageId !== null) {
		const savedPage = await repository.getPage(savedPageId, signal);
		signal.throwIfAborted();
		if (savedPage !== null) return resolveSavedPage(snapshot, parentPageId, note, savedPage, isLegacy);
	}

	signal.throwIfAborted();
	const candidates = await repository.findPagesByTitle(snapshot.spaceKey, note.title, signal);
	signal.throwIfAborted();
	if (candidates.length === 0) {
		return {
			page: {
				note,
				...(parentPageId === snapshot.parentPageId ? {} : { parentPageId }),
				pageId: null,
				operation: 'create',
				migrateLegacy: isLegacy,
				claimOwnership: false,
			},
		};
	}

	const candidate = candidates[0];
	if (candidates.length !== 1 || !isExactOwnedPage(candidate, snapshot, parentPageId, note.path)) {
		return {
			issue: {
				code: 'ambiguous-page',
				path: note.path,
				message: `タイトル「${note.title}」の既存ページを安全に一意特定できません。公開先と所有情報を確認してください。`,
			},
		};
	}

	return {
		page: {
			note,
			...(parentPageId === snapshot.parentPageId ? {} : { parentPageId }),
			pageId: candidate.id,
			operation: 'update',
			migrateLegacy: isLegacy,
			claimOwnership: false,
		},
	};
}

function resolveSavedPage(
	snapshot: DestinationSnapshot,
	parentPageId: string,
	note: NoteCandidate,
	page: ResolvedPage,
	isLegacy: boolean,
): { page: PlannedPage } | { issue: PlanIssue } {
	const exactLocation = page.spaceKey === snapshot.spaceKey && page.parentPageId === parentPageId;
	const exactOwnership = isExpectedOwnership(page.ownership, snapshot.destinationId, note.path);
	const acceptableLegacyOwnership = isLegacy && page.ownership === null;
	if (!exactLocation || (!exactOwnership && !acceptableLegacyOwnership)) {
		return {
			issue: {
				code: 'destination-mismatch',
				path: note.path,
				message: `保存済みページID「${page.id}」の公開先または所有情報が一致しません。`,
			},
		};
	}

	return {
		page: {
			note,
			...(parentPageId === snapshot.parentPageId ? {} : { parentPageId }),
			pageId: page.id,
			operation: 'update',
			migrateLegacy: isLegacy,
			claimOwnership: acceptableLegacyOwnership,
		},
	};
}

function isExactOwnedPage(page: ResolvedPage, snapshot: DestinationSnapshot, parentPageId: string, sourcePath: string): boolean {
	return page.spaceKey === snapshot.spaceKey
		&& page.parentPageId === parentPageId
		&& isExpectedOwnership(page.ownership, snapshot.destinationId, sourcePath);
}

function isExpectedOwnership(
	ownership: PageOwnership | null,
	destinationId: string,
	sourcePath: string,
): boolean {
	return ownership?.schemaVersion === 1
		&& ownership.destinationId === destinationId
		&& ownership.sourcePath === sourcePath;
}
