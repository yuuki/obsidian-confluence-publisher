import { describe, expect, it } from 'vitest';
import { attachmentNameForPath } from './attachment-name';

describe('attachmentNameForPath', () => {
	it('adds a path-derived digest to colliding basenames', () => {
		const left = attachmentNameForPath('a/diagram.png');
		const right = attachmentNameForPath('b/diagram.png');

		expect(left).toMatch(/^diagram-[0-9a-f]{12}\.png$/);
		expect(right).toMatch(/^diagram-[0-9a-f]{12}\.png$/);
		expect(left).not.toBe(right);
	});

	it('is deterministic and normalizes path separators', () => {
		expect(attachmentNameForPath('assets\\Diagram.PNG')).toBe(
			attachmentNameForPath('assets/Diagram.PNG'),
		);
		expect(attachmentNameForPath('assets/Diagram.PNG')).toBe(
			attachmentNameForPath('assets/Diagram.PNG'),
		);
	});

	it('lowercases extensions and sanitizes unsafe stems', () => {
		expect(attachmentNameForPath('assets/My diagram.PNG')).toMatch(
			/^My-diagram-[0-9a-f]{12}\.png$/,
		);
		expect(attachmentNameForPath('assets/日本語.PNG')).toMatch(
			/^attachment-[0-9a-f]{12}\.png$/,
		);
	});

	it('never emits path separators or CRLF characters', () => {
		const result = attachmentNameForPath('folder/evil\r\nname.SVG');

		expect(result).not.toMatch(/[\\/\r\n]/);
		expect(result).toMatch(/\.svg$/);
	});
});
