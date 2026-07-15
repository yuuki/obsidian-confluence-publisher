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
	const hasValidatedLegacyPair = typeof source.spaceKey === 'string'
		&& typeof source.parentPageId === 'string';
	if (
		destinations.length === 0
		&& hasValidatedLegacyPair
	) {
		destinations = [{
			id: createId(),
			label: source.spaceKey as string,
			spaceKey: source.spaceKey as string,
			parentPageId: source.parentPageId as string,
		}];
		changed = true;
	}
	destinations = destinations.map((destination) => {
		if (typeof destination.id === 'string' && destination.id.length > 0) return destination;
		changed = true;
		return { ...destination, id: createId() };
	});
	if (hasValidatedLegacyPair) changed = true;
	const settings: ConfluencePublisherSettings = {
		...DEFAULT_SETTINGS,
		...source,
		destinations,
	} as ConfluencePublisherSettings;
	if (hasValidatedLegacyPair) {
		delete (settings as ConfluencePublisherSettings & { spaceKey?: unknown }).spaceKey;
		delete (settings as ConfluencePublisherSettings & { parentPageId?: unknown }).parentPageId;
	}
	return { settings, changed };
}

export async function loadMigratedSettings(
	data: unknown,
	createId: () => string,
	save: (settings: ConfluencePublisherSettings) => Promise<void>,
): Promise<ConfluencePublisherSettings> {
	const migration = migrateSettings(data, createId);
	if (migration.changed) await save(migration.settings);
	return migration.settings;
}
