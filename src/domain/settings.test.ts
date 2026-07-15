import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings } from './settings';

describe('migrateSettings', () => {
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
