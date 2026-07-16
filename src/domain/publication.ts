export interface Destination {
  id: string;
  label: string;
  spaceKey: string;
  parentPageId: string;
}

export interface DestinationSnapshot {
  destinationId: string;
  baseUrl: string;
  spaceKey: string;
  parentPageId: string;
}

export interface PublicationRecord extends DestinationSnapshot {
	destinationParentPageId?: string;
	pageId: string;
	pageUrl: string;
}

export interface LegacyPublication {
  pageId: string;
  pageUrl: string | null;
}

export interface NoteInput {
  path: string;
  basename: string;
  raw: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface ResolvedPage {
  id: string;
  title: string;
  spaceKey: string;
  parentPageId: string | null;
  version: number;
  webui: string | null;
  ownership: PageOwnership | null;
}

export const PAGE_OWNERSHIP_PROPERTY = 'obsidian-confluence-publisher';

export interface PageOwnership {
  schemaVersion: 1;
  destinationId: string;
  sourcePath: string;
}

export interface EmbeddedImage {
  sourcePath: string;
  resolvedPath: string;
  attachmentName: string;
  width: number | null;
}

export interface NoteCandidate extends NoteInput {
  title: string;
  publication: PublicationRecord | null;
  legacyPublication: LegacyPublication | null;
  images: Array<EmbeddedImage | { sourcePath: string; resolvedPath: null }>;
}

export interface PlannedPage {
	note: NoteCandidate;
	parentPageId?: string;
  pageId: string | null;
  operation: 'create' | 'update';
  migrateLegacy: boolean;
  claimOwnership: boolean;
}

export type PlanIssueCode =
  | 'invalid-file'
  | 'invalid-destination'
  | 'invalid-frontmatter'
  | 'duplicate-title'
  | 'duplicate-page-id'
  | 'unresolved-image'
  | 'destination-mismatch'
  | 'ambiguous-page';

export interface PlanIssue {
  code: PlanIssueCode;
  path: string | null;
  message: string;
}

export type PublicationPlanResult =
  | { ok: true; snapshot: DestinationSnapshot; pages: PlannedPage[] }
  | { ok: false; issues: PlanIssue[] };

export interface PageLookup {
  getPage(pageId: string, signal: AbortSignal): Promise<ResolvedPage | null>;
  findPagesByTitle(spaceKey: string, title: string, signal: AbortSignal): Promise<ResolvedPage[]>;
}

export interface PublishRepository extends PageLookup {
  createPage(spaceKey: string, parentId: string, title: string, body: string, signal: AbortSignal): Promise<ResolvedPage>;
  setPageOwnership(pageId: string, ownership: PageOwnership, signal: AbortSignal): Promise<void>;
  deletePage(pageId: string, signal: AbortSignal): Promise<void>;
  updatePage(pageId: string, title: string, body: string, currentVersion: number, signal: AbortSignal): Promise<void>;
  putAttachment(pageId: string, filename: string, data: ArrayBuffer, mimeType: string, signal: AbortSignal): Promise<'created' | 'updated'>;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function destinationSnapshot(baseUrl: string, destination: Destination): DestinationSnapshot {
  return {
    destinationId: destination.id,
    baseUrl: normalizeBaseUrl(baseUrl),
    spaceKey: destination.spaceKey.trim(),
    parentPageId: destination.parentPageId.trim(),
  };
}

export function isSameDestination(left: DestinationSnapshot, right: DestinationSnapshot): boolean {
  return left.destinationId === right.destinationId
    && normalizeBaseUrl(left.baseUrl) === normalizeBaseUrl(right.baseUrl)
    && left.spaceKey === right.spaceKey
    && left.parentPageId === right.parentPageId;
}

export function isSamePublicationDestination(
	record: PublicationRecord,
	destination: DestinationSnapshot,
): boolean {
	return record.destinationId === destination.destinationId
		&& normalizeBaseUrl(record.baseUrl) === normalizeBaseUrl(destination.baseUrl)
		&& record.spaceKey === destination.spaceKey
		&& (record.destinationParentPageId ?? record.parentPageId) === destination.parentPageId;
}
