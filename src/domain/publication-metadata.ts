import type { LegacyPublication, PublicationRecord } from './publication';

export const PUBLICATIONS_KEY = 'confluence-publications';

export function readPublication(
	frontmatter: Record<string, unknown>,
	destinationId: string,
): PublicationRecord | null {
	const publications = frontmatter[PUBLICATIONS_KEY];
	if (!isRecord(publications)) return null;
	const value = publications[destinationId];
	if (!isRecord(value)) return null;
	const required = ['base-url', 'space-key', 'parent-page-id', 'page-id', 'page-url'] as const;
	if (required.some((key) => typeof value[key] !== 'string' || value[key].length === 0)) return null;
	const destinationParentPageId = value['destination-parent-page-id'];
	if (destinationParentPageId !== undefined
		&& (typeof destinationParentPageId !== 'string' || destinationParentPageId.length === 0)) return null;
	return {
		destinationId,
		baseUrl: value['base-url'] as string,
		spaceKey: value['space-key'] as string,
		parentPageId: value['parent-page-id'] as string,
		pageId: value['page-id'] as string,
		pageUrl: value['page-url'] as string,
		...(destinationParentPageId === undefined ? {} : { destinationParentPageId }),
	};
}

export function readAllPublications(
	frontmatter: Record<string, unknown>,
): Record<string, PublicationRecord> {
	const publications = frontmatter[PUBLICATIONS_KEY];
	if (!isRecord(publications)) return {};
	return Object.keys(publications).reduce<Record<string, PublicationRecord>>((result, id) => {
		const record = readPublication(frontmatter, id);
		if (record) result[id] = record;
		return result;
	}, {});
}

export function readLegacyPublication(
	frontmatter: Record<string, unknown>,
): LegacyPublication | null {
	const pageId = frontmatter['confluence-page-id'];
	if (typeof pageId !== 'string' || pageId.length === 0) return null;
	const pageUrl = frontmatter['confluence-url'];
	return { pageId, pageUrl: typeof pageUrl === 'string' ? pageUrl : null };
}

export function writePublication(
	frontmatter: Record<string, unknown>,
	record: PublicationRecord,
): Record<string, unknown> {
	const current = isRecord(frontmatter[PUBLICATIONS_KEY])
		? { ...(frontmatter[PUBLICATIONS_KEY] as Record<string, unknown>) }
		: {};
	current[record.destinationId] = {
		'base-url': record.baseUrl,
		'space-key': record.spaceKey,
		'parent-page-id': record.parentPageId,
		'page-id': record.pageId,
		'page-url': record.pageUrl,
		...(record.destinationParentPageId === undefined
			? {}
			: { 'destination-parent-page-id': record.destinationParentPageId }),
	};
	const next: Record<string, unknown> = { ...frontmatter, [PUBLICATIONS_KEY]: current };
	delete next['confluence-page-id'];
	delete next['confluence-url'];
	return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
