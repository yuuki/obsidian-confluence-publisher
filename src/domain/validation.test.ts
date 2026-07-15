import { describe, expect, it } from 'vitest';
import { validateDestination, validatePublishFiles } from './validation';

describe('publish input validation', () => {
	it('reports every missing destination field', () => {
		expect(validateDestination({ id: '', label: '', spaceKey: '', parentPageId: '' })).toEqual([
			'Destination ID is required.',
			'Space key is required.',
			'Parent page ID is required.',
		]);
	});

	it('accepts only Markdown files', () => {
		expect(validatePublishFiles([
			{ path: 'note.md', extension: 'md' },
			{ path: 'image.png', extension: 'png' },
		])).toEqual(['image.png is not a Markdown file.']);
	});

	it('rejects an empty file selection', () => {
		expect(validatePublishFiles([])).toEqual(['Select at least one Markdown file.']);
	});
});
