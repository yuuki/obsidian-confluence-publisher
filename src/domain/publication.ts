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
