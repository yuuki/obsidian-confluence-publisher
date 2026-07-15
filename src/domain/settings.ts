import type { Destination } from './publication';

export interface ConfluencePublisherSettings {
	confluenceUrl: string;
	destinations: Destination[];
	authType: 'pat' | 'basic';
	token: string;
	username: string;
	password: string;
	stripFrontmatter: boolean;
	titleSource: 'frontmatter' | 'filename';
}

export const DEFAULT_SETTINGS: ConfluencePublisherSettings = {
	confluenceUrl: '',
	destinations: [],
	authType: 'pat',
	token: '',
	username: '',
	password: '',
	stripFrontmatter: true,
	titleSource: 'frontmatter',
};

export interface MigrationResult {
	settings: ConfluencePublisherSettings;
	changed: boolean;
}

export function migrateSettings(
	data: unknown,
	createId: () => string,
): MigrationResult {
	const validSource = typeof data === 'object' && data !== null && !Array.isArray(data);
	const source = (validSource ? data : {}) as Partial<ConfluencePublisherSettings> & {
		spaceKey?: unknown;
		parentPageId?: unknown;
	};
	let changed = !validSource;
	let destinations = Array.isArray(source.destinations)
		? source.destinations.map((destination) => ({ ...destination }))
		: [];
	if (!Array.isArray(source.destinations)) changed = true;
	if (
		destinations.length === 0
		&& typeof source.spaceKey === 'string'
		&& typeof source.parentPageId === 'string'
	) {
		destinations = [{
			id: createId(),
			label: source.spaceKey,
			spaceKey: source.spaceKey,
			parentPageId: source.parentPageId,
		}];
		changed = true;
	}
	destinations = destinations.map((destination) => {
		if (typeof destination.id === 'string' && destination.id.length > 0) return destination;
		changed = true;
		return { ...destination, id: createId() };
	});
	if ('spaceKey' in source || 'parentPageId' in source) changed = true;
	const settings: ConfluencePublisherSettings = {
		...DEFAULT_SETTINGS,
		...source,
		destinations,
	} as ConfluencePublisherSettings;
	delete (settings as ConfluencePublisherSettings & { spaceKey?: unknown }).spaceKey;
	delete (settings as ConfluencePublisherSettings & { parentPageId?: unknown }).parentPageId;
	return { settings, changed };
}
