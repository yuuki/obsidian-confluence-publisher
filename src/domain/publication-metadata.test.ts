import { describe, expect, it } from 'vitest';
import {
	PUBLICATIONS_KEY,
	readAllPublications,
	readLegacyPublication,
	readPublication,
	writePublication,
} from './publication-metadata';

const record = {
	destinationId: 'dest-1',
	baseUrl: 'https://example.test',
	spaceKey: 'DOC',
	parentPageId: '42',
	pageId: '99',
	pageUrl: 'https://example.test/pages/viewpage.action?pageId=99',
};

const storedRecord = {
	'base-url': record.baseUrl,
	'space-key': record.spaceKey,
	'parent-page-id': record.parentPageId,
	'page-id': record.pageId,
	'page-url': record.pageUrl,
};

const requiredFields = [
	'base-url',
	'space-key',
	'parent-page-id',
	'page-id',
	'page-url',
] as const;

describe('publication metadata', () => {
	it.each(requiredFields)('rejects an invalid %s field', (field) => {
		const missing: Record<string, unknown> = { ...storedRecord };
		delete missing[field];
		const wrongType = { ...storedRecord, [field]: 42 };
		const empty = { ...storedRecord, [field]: '' };

		for (const invalid of [missing, wrongType, empty]) {
			expect(readPublication({
				[PUBLICATIONS_KEY]: { 'dest-1': invalid },
			}, 'dest-1')).toBeNull();
		}
	});

	it('reads only valid destination records', () => {
		const frontmatter = {
			[PUBLICATIONS_KEY]: {
				'dest-1': storedRecord,
				'dest-invalid': { ...storedRecord, 'page-id': '' },
			},
		};

		expect(readAllPublications(frontmatter)).toEqual({ 'dest-1': record });
	});

	it('writes a destination record and removes legacy keys only in the returned copy', () => {
		const original = {
			title: 'Example',
			'confluence-page-id': 'old',
			'confluence-url': 'https://example.test/old',
		};
		const next = writePublication(original, record);

		expect(readPublication(next, 'dest-1')).toEqual(record);
		expect(readLegacyPublication(next)).toBeNull();
		expect(next).not.toHaveProperty('confluence-page-id');
		expect(next).not.toHaveProperty('confluence-url');
		expect(original).toEqual({
			title: 'Example',
			'confluence-page-id': 'old',
			'confluence-url': 'https://example.test/old',
		});
	});

	it('replaces only the target publication without mutating a sibling or the input', () => {
		const sibling = {
			'base-url': 'https://sibling.test',
			'space-key': 'OTHER',
			'parent-page-id': '84',
			'page-id': '100',
			'page-url': 'https://sibling.test/pages/viewpage.action?pageId=100',
		};
		const original = {
			[PUBLICATIONS_KEY]: {
				'dest-1': { ...storedRecord, 'page-id': 'old' },
				'dest-2': sibling,
			},
		};
		const originalSnapshot = structuredClone(original);

		const next = writePublication(original, record);

		expect(readPublication(next, 'dest-1')).toEqual(record);
		expect(readPublication(next, 'dest-2')).toEqual({
			destinationId: 'dest-2',
			baseUrl: sibling['base-url'],
			spaceKey: sibling['space-key'],
			parentPageId: sibling['parent-page-id'],
			pageId: sibling['page-id'],
			pageUrl: sibling['page-url'],
		});
		expect(original).toEqual(originalSnapshot);
		expect(sibling).toEqual(originalSnapshot[PUBLICATIONS_KEY]['dest-2']);
	});

	it('reads a legacy page ID without a URL', () => {
		expect(readLegacyPublication({ 'confluence-page-id': '99' })).toEqual({
			pageId: '99',
			pageUrl: null,
		});
	});
});
