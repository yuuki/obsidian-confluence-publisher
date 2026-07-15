import { describe, expect, it } from 'vitest';
import { readLegacyPublication, readPublication, writePublication } from './publication-metadata';

const record = {
	destinationId: 'dest-1',
	baseUrl: 'https://example.test',
	spaceKey: 'DOC',
	parentPageId: '42',
	pageId: '99',
	pageUrl: 'https://example.test/pages/viewpage.action?pageId=99',
};

describe('publication metadata', () => {
	it('writes a destination record and removes legacy keys only in the returned copy', () => {
		const original = {
			title: 'Example',
			'confluence-page-id': 'old',
			'confluence-url': 'https://example.test/old',
		};
		const next = writePublication(original, record);

		expect(readPublication(next, 'dest-1')).toEqual(record);
		expect(readLegacyPublication(next)).toBeNull();
		expect(original['confluence-page-id']).toBe('old');
	});
});
