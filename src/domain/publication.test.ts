import { describe, expect, it } from 'vitest';
import { destinationSnapshot, isSameDestination } from './publication';

describe('destinationSnapshot', () => {
  it('normalizes the base URL and copies the destination identity', () => {
    const snapshot = destinationSnapshot('https://example.test/confluence/', {
      id: 'dest-1',
      label: 'Docs',
      spaceKey: 'DOC',
      parentPageId: '42',
    });

    expect(snapshot).toEqual({
      destinationId: 'dest-1',
      baseUrl: 'https://example.test/confluence',
      spaceKey: 'DOC',
      parentPageId: '42',
    });
    expect(isSameDestination(snapshot, { ...snapshot, parentPageId: '99' })).toBe(false);
  });
});
