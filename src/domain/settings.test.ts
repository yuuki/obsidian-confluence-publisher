import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings } from './settings';

describe('migrateSettings', () => {
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
