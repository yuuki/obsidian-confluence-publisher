import { describe, expect, it, vi } from 'vitest';
import { TransportError, type JsonRequest, type NodeHttpTransport } from './transport';
import { ConfluenceRepository } from './repository';

function signal(): AbortSignal {
  return new AbortController().signal;
}

function fakeTransport(responses: unknown[]): NodeHttpTransport {
  return {
    requestJson: vi.fn(async (_request: JsonRequest) => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }),
    requestEmpty: vi.fn(async () => undefined),
  } as unknown as NodeHttpTransport;
}

describe('ConfluenceRepository', () => {
  it('returns all exact-title pages so the planner can verify parent identity', async () => {
    const transport = fakeTransport([{
      results: [
        { id: 'one', title: 'Same', space: { key: 'DOC' }, ancestors: [{ id: '42' }], version: { number: 1 } },
        { id: 'two', title: 'Same', space: { key: 'DOC' }, ancestors: [{ id: '77' }], version: { number: 1 } },
      ],
      size: 2,
      _links: {},
    }]);
    const repository = new ConfluenceRepository(transport);

    const pages = await repository.findPagesByTitle('DOC', 'Same', signal());

    expect(pages.map((page) => page.parentPageId)).toEqual(['42', '77']);
    expect(transport.requestJson).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringContaining('title=Same'),
    }));
  });

  it('returns null only when getPage receives a 404', async () => {
    const transport = fakeTransport([]);
    vi.mocked(transport.requestJson).mockRejectedValueOnce(new TransportError('http', 'missing', 404));

    await expect(new ConfluenceRepository(transport).getPage('missing', signal())).resolves.toBeNull();
  });

  it('propagates getPage errors other than 404', async () => {
    const error = new TransportError('http', 'server failed', 500);
    const repository = new ConfluenceRepository(fakeTransport([error]));

    await expect(repository.getPage('broken', signal())).rejects.toBe(error);
  });

  it('follows all title result pages and maps location and valid ownership', async () => {
    const transport = fakeTransport([
      {
        results: [{
          id: 'one',
          title: 'Same',
          space: { key: 'DOC' },
          ancestors: [{ id: 'root' }, { id: '42' }],
          version: { number: 3 },
          _links: { webui: '/pages/one' },
          metadata: { properties: { 'obsidian-confluence-publisher': {
            id: 'property-one',
            value: { schemaVersion: 1, destinationId: 'docs', sourcePath: 'note.md' },
          } } },
        }],
        size: 1,
        _links: { next: '/rest/api/content?start=1' },
      },
      {
        results: [{ id: 'two', title: 'Same', space: { key: 'DOC' }, ancestors: [], version: { number: 1 } }],
        size: 1,
        _links: {},
      },
    ]);

    const pages = await new ConfluenceRepository(transport).findPagesByTitle('DOC', 'Same', signal());

    expect(pages).toEqual([
      expect.objectContaining({
        id: 'one', spaceKey: 'DOC', parentPageId: '42', version: 3, webui: '/pages/one',
        ownership: { schemaVersion: 1, destinationId: 'docs', sourcePath: 'note.md' },
      }),
      expect.objectContaining({ id: 'two', parentPageId: null, ownership: null }),
    ]);
    expect(transport.requestJson).toHaveBeenNthCalledWith(2, expect.objectContaining({
      path: '/rest/api/content?start=1',
    }));
  });

  it('rejects malformed ownership instead of treating the page as unowned', async () => {
    const transport = fakeTransport([{
      id: 'p', title: 'Page', space: { key: 'DOC' }, ancestors: [{ id: '42' }], version: { number: 1 },
      metadata: { properties: { 'obsidian-confluence-publisher': {
        id: 'property-p', value: { schemaVersion: 2, destinationId: 'docs', sourcePath: 'note.md' },
      } } },
    }]);

    await expect(new ConfluenceRepository(transport).getPage('p', signal()))
      .rejects.toThrow('ownership');
  });

  it('rejects a page response whose required fields are malformed', async () => {
    const transport = fakeTransport([{ id: 'p', title: 'Page', version: {} }]);

    await expect(new ConfluenceRepository(transport).getPage('p', signal()))
      .rejects.toThrow('page response');
  });

  it('sends create, update, ownership, and rollback requests with their payloads and signals', async () => {
    const transport = fakeTransport([
      { id: 'p', title: 'Page', space: { key: 'DOC' }, ancestors: [{ id: '42' }], version: { number: 1 } },
      {},
    ]);
    const repository = new ConfluenceRepository(transport);
    const requestSignal = signal();

    const created = await repository.createPage('DOC', '42', 'Page', '<p>placeholder</p>', requestSignal);
    await repository.updatePage('p', 'Renamed', '<p>body</p>', 4, requestSignal);
    await repository.setPageOwnership('p', {
      schemaVersion: 1, destinationId: 'docs', sourcePath: 'note.md',
    }, requestSignal);
    await repository.deletePage('p', requestSignal);

    expect(created).toEqual(expect.objectContaining({ spaceKey: 'DOC', parentPageId: '42' }));

    expect(transport.requestJson).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'POST', path: '/rest/api/content', signal: requestSignal,
      body: JSON.stringify({
        type: 'page', title: 'Page', space: { key: 'DOC' }, ancestors: [{ id: '42' }],
        body: { storage: { value: '<p>placeholder</p>', representation: 'storage' } },
      }),
    }));
    expect(transport.requestEmpty).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'PUT', path: '/rest/api/content/p', signal: requestSignal,
      body: expect.stringContaining('"number":5'),
    }));
    expect(transport.requestJson).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'POST', path: '/rest/api/content/p/property', signal: requestSignal,
      body: expect.stringContaining('"sourcePath":"note.md"'),
    }));
    expect(transport.requestEmpty).toHaveBeenNthCalledWith(2, {
      method: 'DELETE', path: '/rest/api/content/p', signal: requestSignal,
    });
  });

  it('propagates an ownership property conflict without issuing an overwrite', async () => {
    const conflict = new TransportError('http', 'conflict', 409);
    const transport = fakeTransport([conflict]);

    await expect(new ConfluenceRepository(transport).setPageOwnership('p', {
      schemaVersion: 1, destinationId: 'docs', sourcePath: 'note.md',
    }, signal())).rejects.toBe(conflict);
    expect(transport.requestJson).toHaveBeenCalledTimes(1);
    expect(transport.requestJson).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }));
  });

  it('follows attachment next links and updates an existing attachment by id', async () => {
    const transport = fakeTransport([
      { results: [{ id: 'a1', title: 'one.png' }], size: 1, _links: { next: '/rest/api/content/p/child/attachment?start=1' } },
      { results: [{ id: 'a2', title: 'two.png' }], size: 1, _links: {} },
      { results: [{ id: 'a2', title: 'two.png' }], size: 1, _links: {} },
    ]);
    const repository = new ConfluenceRepository(transport);

    const attachments = await repository.listAttachments('p', signal());
    await repository.putAttachment('p', 'two.png', new TextEncoder().encode('new').buffer, 'image/png', signal());

    expect(attachments.get('two.png')?.id).toBe('a2');
    expect(transport.requestJson).toHaveBeenLastCalledWith(expect.objectContaining({
      path: '/rest/api/content/p/child/attachment/a2/data',
    }));
  });

  it('does not cache a partial attachment listing after a later page fails', async () => {
    const failure = new TransportError('network', 'failed');
    const transport = fakeTransport([
      { results: [{ id: 'a1', title: 'one.png' }], size: 1, _links: { next: '/next' } },
      failure,
      { results: [{ id: 'a1', title: 'one.png' }], size: 1, _links: {} },
    ]);
    const repository = new ConfluenceRepository(transport);

    await expect(repository.listAttachments('p', signal())).rejects.toBe(failure);
    await expect(repository.listAttachments('p', signal())).resolves.toEqual(
      new Map([['one.png', { id: 'a1', title: 'one.png' }]]),
    );
    expect(transport.requestJson).toHaveBeenNthCalledWith(3, expect.objectContaining({
      path: expect.stringContaining('/rest/api/content/p/child/attachment'),
    }));
  });

  it('uses the returned attachment id when the server normalizes its title', async () => {
    const transport = fakeTransport([
      { results: [], size: 0, _links: {} },
      { results: [{ id: 'server-id', title: 'latest.png' }], size: 1, _links: {} },
      { results: [{ id: 'server-id', title: 'server.png' }], size: 1, _links: {} },
    ]);
    const repository = new ConfluenceRepository(transport);

    await expect(repository.putAttachment('p', 'local.png', new Uint8Array([1]).buffer, 'image/png', signal()))
      .resolves.toBe('created');
    await expect(repository.putAttachment('p', 'local.png', new Uint8Array([2]).buffer, 'image/png', signal()))
      .resolves.toBe('updated');

    expect(transport.requestJson).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'POST', path: '/rest/api/content/p/child/attachment',
    }));
    expect(transport.requestJson).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'POST', path: '/rest/api/content/p/child/attachment/server-id/data',
    }));
    expect(await repository.listAttachments('p', signal())).toEqual(
      new Map([['server.png', { id: 'server-id', title: 'server.png' }]]),
    );
  });

  it('escapes multipart quoted filenames and preserves raw file bytes', async () => {
    const transport = fakeTransport([
      { results: [], size: 0, _links: {} },
      { results: [{ id: 'a', title: 'a"b\\c.png' }], size: 1, _links: {} },
    ]);
    const repository = new ConfluenceRepository(transport);
    const bytes = new Uint8Array([0, 13, 10, 255, 34, 92]);

    await repository.putAttachment('p', 'a"b\\c.png', bytes.buffer, 'image/png', signal());

    const upload = vi.mocked(transport.requestJson).mock.calls[1]?.[0];
    expect(upload?.headers?.['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(new TextDecoder('latin1').decode(upload?.body as Uint8Array))
      .toContain('filename="a\\"b\\\\c.png"');
    expect(containsBytes(upload?.body as Uint8Array, bytes)).toBe(true);
  });

  it('chooses a multipart boundary that does not occur in the file bytes', async () => {
    const transport = fakeTransport([
      { results: [], size: 0, _links: {} },
      { results: [{ id: 'a', title: 'a.png' }], size: 1, _links: {} },
    ]);
    vi.resetModules();
    const { ConfluenceRepository: FreshRepository } = await import('./repository');
    const collision = new TextEncoder().encode('----obsidian-confluence-publisher-1');

    await new FreshRepository(transport).putAttachment('p', 'a.png', collision.buffer, 'image/png', signal());

    const upload = vi.mocked(transport.requestJson).mock.calls[1]?.[0];
    const boundary = upload?.headers?.['Content-Type'].split('boundary=')[1];
    expect(boundary).toBeDefined();
    expect(new TextDecoder().decode(collision)).not.toContain(boundary);
  });

  it.each([
    ['bad\rname.png', 'image/png'],
    ['bad\nname.png', 'image/png'],
    ['safe.png', 'image/png\r\nX-Evil: yes'],
    ['bad\0name.png', 'image/png'],
    ['safe.png', 'image/png\tX-Evil'],
  ])('rejects multipart header injection in filename or MIME type', async (filename, mimeType) => {
    const transport = fakeTransport([]);

    await expect(new ConfluenceRepository(transport).putAttachment(
      'p', filename, new Uint8Array([1]).buffer, mimeType, signal(),
    )).rejects.toThrow(/line break|control character/);
    expect(transport.requestJson).not.toHaveBeenCalled();
  });
});

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}
