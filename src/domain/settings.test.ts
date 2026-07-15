import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadMigratedSettings, migrateSettings } from './settings';
import type { ConfluencePublisherSettings } from './settings';

describe('migrateSettings', () => {
	it('normalizes, saves, and stably reloads falsy persisted data', async () => {
		const saved: ConfluencePublisherSettings[] = [];
		const save = async (settings: ConfluencePublisherSettings): Promise<void> => {
			saved.push(settings);
		};
		const createId = (): string => {
			throw new Error('must not create a destination id');
		};

		const first = await loadMigratedSettings(false, createId, save);

		expect(first).toEqual(DEFAULT_SETTINGS);
		expect(first).not.toBe(DEFAULT_SETTINGS);
		expect(first.destinations).not.toBe(DEFAULT_SETTINGS.destinations);
		expect(saved).toEqual([first]);

		const reloaded = await loadMigratedSettings(saved[0], createId, save);

		expect(reloaded).toEqual(first);
		expect(saved).toHaveLength(1);
	});

	it.each([
		['space key only', { spaceKey: 'DOC' }],
		['parent page ID only', { parentPageId: '42' }],
		['invalid parent page ID', { spaceKey: 'DOC', parentPageId: 42 }],
	] satisfies Array<[string, Record<string, unknown>]>)
	('preserves %s until legacy settings form a valid pair', (_case, data) => {
		const createId = (): string => {
			throw new Error('must not create a destination id');
		};

		const first = migrateSettings(data, createId);
		const reloaded = migrateSettings(first.settings, createId);

		expect(first.changed).toBe(true);
		expect(first.settings).toMatchObject(data);
		expect(first.settings.destinations).toEqual([]);
		expect(reloaded.changed).toBe(false);
		expect(reloaded.settings).toMatchObject(data);
	});

	it.each([
		['string', 'corrupted'],
		['number', 42],
		['boolean', true],
		['null', null],
		['array', []],
	])('normalizes invalid %s persisted data', (_type, data) => {
		const result = migrateSettings(data, () => 'must-not-run');

		expect(result.changed).toBe(true);
		expect(result.settings).toEqual(DEFAULT_SETTINGS);
		expect(result.settings).not.toBe(DEFAULT_SETTINGS);
		expect(result.settings.destinations).not.toBe(DEFAULT_SETTINGS.destinations);
	});

	it('creates stable destination ids without mutating defaults', () => {
		const legacy = { spaceKey: 'DOC', parentPageId: '42' };
		const first = migrateSettings(legacy, () => 'dest-generated');
		const second = migrateSettings(first.settings, () => 'must-not-run');

		expect(first.changed).toBe(true);
		expect(first.settings.destinations[0]).toMatchObject({
			id: 'dest-generated', spaceKey: 'DOC', parentPageId: '42',
		});
		expect(second.changed).toBe(false);
		expect(second.settings.destinations[0].id).toBe('dest-generated');
		expect(DEFAULT_SETTINGS.destinations).toEqual([]);
	});
});
