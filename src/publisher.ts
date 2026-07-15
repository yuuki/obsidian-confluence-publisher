import { convertMarkdown } from './converter/storage-renderer';
import {
	normalizeBaseUrl,
	isSameDestination,
	type Destination,
	type DestinationSnapshot,
	type NoteCandidate,
	type PageOwnership,
	type PlannedPage,
	type PublicationRecord,
	type PublishRepository,
	type ResolvedPage,
} from './domain/publication';
import {
	readLegacyPublication,
	readPublication,
} from './domain/publication-metadata';
import { buildPublicationPlan } from './domain/publication-planner';
import type { ConfluencePublisherSettings } from './domain/settings';
import {
	resolveNoteTitle,
	selectPublishContent,
	type NoteFileRef,
	type NoteRepository,
} from './obsidian/note-repository';

const PLACEHOLDER_BODY = '<p>Importing from Obsidian...</p>';
const CLEANUP_TIMEOUT_MS = 5_000;

export type ProgressEvent =
	| { type: 'planned'; total: number }
	| { type: 'page-created'; title: string }
	| { type: 'attachment-created' | 'attachment-updated'; title: string; filename: string }
	| { type: 'page-updated'; title: string }
	| {
		type: 'failed';
		title: string | null;
		phase: 'preflight' | 'page-resolution' | 'content-update';
		error: string;
	}
	| { type: 'cancelled'; succeeded: number; failed: number }
	| { type: 'complete'; succeeded: number; failed: number };

export interface PublisherDependencies {
	notes: NoteRepository;
	repository: PublishRepository;
	settings: Pick<
		ConfluencePublisherSettings,
		'confluenceUrl' | 'stripFrontmatter' | 'titleSource'
	>;
}

export interface CleanupSignal {
	signal: AbortSignal;
	dispose(): void;
}

interface PreparedPage {
	file: NoteFileRef;
	planned: PlannedPage;
	pageId: string;
	webui: string | null;
}

export class Publisher {
	constructor(private readonly dependencies: PublisherDependencies) {}

	async *publish(
		files: NoteFileRef[],
		destination: Destination,
		signal: AbortSignal,
	): AsyncGenerator<ProgressEvent> {
		let succeeded = 0;
		let failed = 0;

		try {
			signal.throwIfAborted();
			const inputErrors = validateInput(files, destination, this.dependencies.settings.confluenceUrl);
			if (inputErrors.length > 0) {
				for (const error of inputErrors) {
					yield { type: 'failed', title: error.title, phase: 'preflight', error: error.message };
				}
				yield completeEvent(files.length, 0);
				return;
			}

			const prepared = await this.prepareCandidates(files, destination, signal);
			if ('failures' in prepared) {
				for (const failure of prepared.failures) yield failure;
				yield completeEvent(files.length, 0);
				return;
			}

			const plan = await buildPublicationPlan({
				baseUrl: this.dependencies.settings.confluenceUrl,
				destination,
				notes: prepared.candidates,
				repository: this.dependencies.repository,
				signal,
			});
			if (!plan.ok) {
				for (const issue of plan.issues) {
					yield {
						type: 'failed',
						title: issue.path,
						phase: 'preflight',
						error: issue.message,
					};
				}
				yield completeEvent(files.length, 0);
				return;
			}

			const pageTitles = await this.loadPublishedPageTitles(plan.snapshot, signal);
			yield { type: 'planned', total: plan.pages.length };
			const resolved: PreparedPage[] = [];
			for (const planned of plan.pages) {
				signal.throwIfAborted();
				const file = prepared.filesByPath.get(planned.note.path);
				if (file === undefined) throw new Error(`Prepared note is missing: ${planned.note.path}`);
				const ownership = pageOwnership(destination, planned.note.path);
				if (planned.operation === 'create') {
					let page: ResolvedPage;
					try {
						page = await this.dependencies.repository.createPage(
							plan.snapshot.spaceKey,
							plan.snapshot.parentPageId,
							planned.note.title,
							PLACEHOLDER_BODY,
							signal,
						);
					} catch (error) {
						if (isAbort(error)) throw error;
						failed++;
						yield resolutionFailure(planned.note.title, error);
						yield completeEvent(files.length, succeeded);
						return;
					}

					try {
						signal.throwIfAborted();
						await this.dependencies.repository.setPageOwnership(page.id, ownership, signal);
					} catch (ownershipError) {
						const cleanupError = await this.rollbackCreatedPage(page.id);
						if (cleanupError !== null) {
							failed++;
							yield {
								type: 'failed',
								title: planned.note.title,
								phase: 'page-resolution',
								error: orphanedPageError(page, ownershipError, cleanupError, plan.snapshot.baseUrl),
							};
						}
						if (isAbort(ownershipError)) throw ownershipError;
						if (cleanupError === null) {
							failed++;
							yield resolutionFailure(planned.note.title, ownershipError);
						}
						yield completeEvent(files.length, succeeded);
						return;
					}
					yield { type: 'page-created', title: planned.note.title };
					resolved.push({ file, planned, pageId: page.id, webui: page.webui });
					continue;
				}

				const pageId = planned.pageId as string;
				if (planned.claimOwnership) {
					try {
						signal.throwIfAborted();
						await this.dependencies.repository.setPageOwnership(pageId, ownership, signal);
					} catch (error) {
						if (isAbort(error)) throw error;
						failed++;
						yield resolutionFailure(planned.note.title, error);
						yield completeEvent(files.length, succeeded);
						return;
					}
				}
				resolved.push({ file, planned, pageId, webui: null });
			}

			for (const item of resolved) pageTitles.set(item.planned.note.path, item.planned.note.title);
			for (const item of resolved) {
				signal.throwIfAborted();
				try {
					const conversion = convertMarkdown(
						selectPublishContent(item.planned.note, this.dependencies.settings.stripFrontmatter),
						{
							sourcePath: item.planned.note.path,
							spaceKey: plan.snapshot.spaceKey,
							pageTitles,
							resolveLink: (target, sourcePath) =>
								this.dependencies.notes.resolveLink(target, sourcePath),
						},
					);
					if (conversion.issues.length > 0) {
						throw new Error(`Unresolved image attachments: ${conversion.issues.map((issue) => issue.target).join(', ')}`);
					}

					const images = new Map(conversion.images.map((image) => [image.attachmentName, image]));
					for (const image of images.values()) {
						signal.throwIfAborted();
						const data = await this.dependencies.notes.readBinary(image.resolvedPath);
						signal.throwIfAborted();
						const result = await this.dependencies.repository.putAttachment(
							item.pageId,
							image.attachmentName,
							data,
							mimeTypeForPath(image.resolvedPath),
							signal,
						);
						yield {
							type: result === 'created' ? 'attachment-created' : 'attachment-updated',
							title: item.planned.note.title,
							filename: image.attachmentName,
						};
					}

					signal.throwIfAborted();
					const current = await this.dependencies.repository.getPage(item.pageId, signal);
					if (current === null) throw new Error(`Page ${item.pageId} disappeared.`);
					signal.throwIfAborted();
					await this.dependencies.repository.updatePage(
						item.pageId,
						item.planned.note.title,
						conversion.storage,
						current.version,
						signal,
					);
					const record: PublicationRecord = {
						...plan.snapshot,
						pageId: item.pageId,
						pageUrl: pageUrl(plan.snapshot.baseUrl, item.pageId, current.webui ?? item.webui),
					};
					await this.dependencies.notes.writePublication(item.file, record);
					succeeded++;
					yield { type: 'page-updated', title: item.planned.note.title };
				} catch (error) {
					if (isAbort(error)) throw error;
					failed++;
					yield {
						type: 'failed',
						title: item.planned.note.title,
						phase: 'content-update',
						error: errorMessage(error),
					};
				}
			}

			yield completeEvent(files.length, succeeded);
		} catch (error) {
			if (isAbort(error)) {
				yield { type: 'cancelled', succeeded, failed };
				return;
			}
			failed++;
			yield { type: 'failed', title: null, phase: 'preflight', error: errorMessage(error) };
			yield completeEvent(files.length, succeeded);
		}
	}

	private async prepareCandidates(
		files: NoteFileRef[],
		destination: Destination,
		signal: AbortSignal,
	): Promise<{
		candidates: NoteCandidate[];
		filesByPath: Map<string, NoteFileRef>;
	} | { failures: Extract<ProgressEvent, { type: 'failed' }>[] }> {
		const candidates: NoteCandidate[] = [];
		const filesByPath = new Map<string, NoteFileRef>();
		const failures: Extract<ProgressEvent, { type: 'failed' }>[] = [];
		for (const file of files) {
			signal.throwIfAborted();
			try {
				const note = await this.dependencies.notes.read(file);
				const title = resolveNoteTitle(note, this.dependencies.settings.titleSource);
				const conversion = convertMarkdown(
					selectPublishContent(note, this.dependencies.settings.stripFrontmatter),
					{
						sourcePath: note.path,
						spaceKey: destination.spaceKey,
						pageTitles: new Map(),
						resolveLink: (target, sourcePath) => this.dependencies.notes.resolveLink(target, sourcePath),
					},
				);
				candidates.push({
					...note,
					title,
					publication: readPublication(note.frontmatter, destination.id),
					legacyPublication: readLegacyPublication(note.frontmatter),
					images: [
						...conversion.images,
						...conversion.issues.map((issue) => ({ sourcePath: issue.target, resolvedPath: null as null })),
					],
				});
				filesByPath.set(note.path, file);
			} catch (error) {
				if (isAbort(error)) throw error;
				failures.push({
					type: 'failed',
					title: file.path,
					phase: 'preflight',
					error: errorMessage(error),
				});
			}
		}
		return failures.length > 0 ? { failures } : { candidates, filesByPath };
	}

	private async loadPublishedPageTitles(
		destination: DestinationSnapshot,
		signal: AbortSignal,
	): Promise<Map<string, string>> {
		signal.throwIfAborted();
		const pageTitles = new Map<string, string>();
		for (const published of await this.dependencies.notes.listPublished(
			destination,
			this.dependencies.settings.titleSource,
		)) {
			if (isSameDestination(published.record, destination)) {
				pageTitles.set(published.path, published.title);
			}
		}
		signal.throwIfAborted();
		return pageTitles;
	}

	private async rollbackCreatedPage(pageId: string): Promise<unknown | null> {
		const cleanup = createCleanupSignal();
		try {
			await this.dependencies.repository.deletePage(pageId, cleanup.signal);
			return null;
		} catch (error) {
			return error;
		} finally {
			cleanup.dispose();
		}
	}
}

export function createCleanupSignal(): CleanupSignal {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CLEANUP_TIMEOUT_MS);
	return {
		signal: controller.signal,
		dispose: () => clearTimeout(timer),
	};
}

function validateInput(
	files: NoteFileRef[],
	destination: Destination,
	baseUrl: string,
): Array<{ title: string | null; message: string }> {
	const failures: Array<{ title: string | null; message: string }> = [];
	if (!destination.id.trim() || !destination.spaceKey.trim() || !destination.parentPageId.trim()) {
		failures.push({ title: null, message: 'Destination is incomplete.' });
	}
	try {
		const url = new URL(normalizeBaseUrl(baseUrl));
		if (!url.protocol || !url.host) throw new Error('invalid');
	} catch {
		failures.push({ title: null, message: 'Confluence base URL is invalid.' });
	}
	for (const file of files) {
		if (file.extension.toLowerCase() !== 'md') {
			failures.push({ title: file.path, message: `${file.path} is not a Markdown file.` });
		}
	}
	return failures;
}

function pageOwnership(destination: Destination, sourcePath: string): PageOwnership {
	return { schemaVersion: 1, destinationId: destination.id, sourcePath };
}

function resolutionFailure(title: string, error: unknown): Extract<ProgressEvent, { type: 'failed' }> {
	return { type: 'failed', title, phase: 'page-resolution', error: errorMessage(error) };
}

function orphanedPageError(
	page: ResolvedPage,
	ownershipError: unknown,
	cleanupError: unknown,
	baseUrl: string,
): string {
	return [
		`Ownership creation failed: ${errorMessage(ownershipError)}.`,
		`Rollback failed: ${errorMessage(cleanupError)}.`,
		`Orphan page ${page.id}: ${pageUrl(baseUrl, page.id, page.webui)}`,
	].join(' ');
}

function pageUrl(baseUrl: string, pageId: string, webui: string | null): string {
	const normalized = normalizeBaseUrl(baseUrl);
	const base = new URL(normalized);
	if (webui !== null) {
		if (/^[a-z][a-z\d+.-]*:\/\//i.test(webui)) {
			try {
				const candidate = new URL(webui);
				if (
					candidate.origin === base.origin
					&& candidate.username === ''
					&& candidate.password === ''
				) return candidate.toString();
			} catch {
				// Fall back to the stable page ID URL below.
			}
		} else if (!webui.startsWith('//')) {
			const basePath = base.pathname.replace(/\/+$/, '');
			const relativePath = webui.startsWith(`${basePath}/`)
				? webui.slice(basePath.length)
				: webui;
			try {
				const candidate = new URL(`${normalized}/${relativePath.replace(/^\/+/, '')}`);
				const withinBasePath = basePath === ''
					|| candidate.pathname === basePath
					|| candidate.pathname.startsWith(`${basePath}/`);
				if (candidate.origin === base.origin && withinBasePath) return candidate.toString();
			} catch {
				// Fall back to the stable page ID URL below.
			}
		}
	}
	return `${normalized}/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`;
}

export function mimeTypeForPath(path: string): string {
	const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	return ({
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
	} as Record<string, string>)[extension] ?? 'application/octet-stream';
}

function isAbort(error: unknown): boolean {
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	return typeof error === 'object'
		&& error !== null
		&& 'code' in error
		&& error.code === 'aborted';
}

function completeEvent(total: number, succeeded: number): Extract<ProgressEvent, { type: 'complete' }> {
	return { type: 'complete', succeeded, failed: Math.max(0, total - succeeded) };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
