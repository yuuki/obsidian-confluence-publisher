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
	const validSource = isRecord(data);
	const source = validSource ? data : {};
	let changed = !validSource;
	let rawDestinations: unknown[] = Array.isArray(source.destinations)
		? source.destinations
		: [];
	if (!Array.isArray(source.destinations)) changed = true;
	const hasValidatedLegacyPair = typeof source.spaceKey === 'string'
		&& typeof source.parentPageId === 'string';
	if (
		rawDestinations.length === 0
		&& hasValidatedLegacyPair
	) {
		rawDestinations = [{
			id: createId(),
			label: source.spaceKey,
			spaceKey: source.spaceKey,
			parentPageId: source.parentPageId,
		}];
		changed = true;
	}
	const destinations = rawDestinations.map((value): Destination => {
		const destination = isRecord(value) ? value : {};
		const id = typeof destination.id === 'string' && destination.id.length > 0
			? destination.id
			: createId();
		const label = typeof destination.label === 'string' ? destination.label : '';
		const spaceKey = typeof destination.spaceKey === 'string' ? destination.spaceKey : '';
		const parentPageId = typeof destination.parentPageId === 'string'
			? destination.parentPageId
			: '';
		if (
			!isRecord(value)
			|| destination.id !== id
			|| destination.label !== label
			|| destination.spaceKey !== spaceKey
			|| destination.parentPageId !== parentPageId
		) {
			changed = true;
		}
		return { ...destination, id, label, spaceKey, parentPageId };
	});
	if (hasValidatedLegacyPair) changed = true;
	const confluenceUrl = normalizeStringSetting(source.confluenceUrl, DEFAULT_SETTINGS.confluenceUrl);
	const token = normalizeStringSetting(source.token, DEFAULT_SETTINGS.token);
	const username = normalizeStringSetting(source.username, DEFAULT_SETTINGS.username);
	const password = normalizeStringSetting(source.password, DEFAULT_SETTINGS.password);
	const authType = source.authType === 'pat' || source.authType === 'basic'
		? source.authType
		: DEFAULT_SETTINGS.authType;
	const stripFrontmatter = typeof source.stripFrontmatter === 'boolean'
		? source.stripFrontmatter
		: DEFAULT_SETTINGS.stripFrontmatter;
	const titleSource = source.titleSource === 'frontmatter' || source.titleSource === 'filename'
		? source.titleSource
		: DEFAULT_SETTINGS.titleSource;
	if (
		source.confluenceUrl !== confluenceUrl
		|| source.authType !== authType
		|| source.token !== token
		|| source.username !== username
		|| source.password !== password
		|| source.stripFrontmatter !== stripFrontmatter
		|| source.titleSource !== titleSource
	) {
		changed = true;
	}
	const settings: ConfluencePublisherSettings = {
		...source,
		confluenceUrl,
		destinations,
		authType,
		token,
		username,
		password,
		stripFrontmatter,
		titleSource,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringSetting(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}
