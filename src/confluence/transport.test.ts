import {
  createServer,
  type RequestListener,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NodeHttpTransport,
  TransportError,
  validateConfluenceBaseUrl,
} from './transport';

interface TestServer {
  url: string;
  close(): Promise<void>;
}

const servers: TestServer[] = [];

async function startServer(
  handler: RequestListener,
  contextPath = '',
  host = '127.0.0.1',
): Promise<TestServer> {
  const sockets = new Set<Socket>();
  const server: Server = createServer(handler);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  const testServer = {
    url: `http://${hostname}:${address.port}${contextPath}`,
    close: () => new Promise<void>((resolve, reject) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
  servers.push(testServer);
  return testServer;
}

function json(res: ServerResponse, value: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('validateConfluenceBaseUrl', () => {
  it.each([
    'http://confluence.example.test',
    'ftp://localhost',
    'file:///tmp/confluence',
  ])('rejects credentials over an unsafe URL: %s', (url) => {
    expect(() => validateConfluenceBaseUrl(url)).toThrowError(TransportError);
    expect(() => validateConfluenceBaseUrl(url)).toThrow(/HTTPS|loopback/i);
  });

  it.each([
    'https://confluence.example.test',
    'http://localhost:8090',
    'http://127.0.0.1:8090',
    'http://[::1]:8090',
  ])('accepts a safe URL: %s', (url) => {
    expect(validateConfluenceBaseUrl(url)).toBeInstanceOf(URL);
  });

  it('reports malformed URLs as typed errors without echoing their value', () => {
    const secret = 'not-a-url?token=super-secret';
    try {
      validateConfluenceBaseUrl(secret);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-url' });
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  it.each([
    'https://user:password@confluence.example.test/confluence',
    'https://confluence.example.test/confluence?token=secret',
    'https://confluence.example.test/confluence#section',
  ])('rejects unsafe or ambiguous base URL components: %s', (url) => {
    expect(() => validateConfluenceBaseUrl(url)).toThrowError(TransportError);
  });
});

describe('NodeHttpTransport', () => {
  it('joins request paths below the Confluence base context path', async () => {
    const server = await startServer((req, res) => {
      json(res, { url: req.url });
    }, '/confluence');
    const transport = new NodeHttpTransport({
      baseUrl: `${server.url}/`,
      headers: {},
    });

    await expect(transport.requestJson({
      method: 'GET',
      path: '/rest/api/content?limit=1',
    })).resolves.toEqual({ url: '/confluence/rest/api/content?limit=1' });
  });

  it.each([
    '../rest/api/content',
    '/../rest/api/content',
    '%2e%2e/rest/api/content',
    '/%2E%2E/rest/api/content',
    '.%2e/rest/api/content',
  ])('rejects a request path that escapes the base context before networking: %s', async (path) => {
    let contacts = 0;
    const server = await startServer((_req, res) => {
      contacts += 1;
      json(res, {});
    }, '/confluence');
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path }))
      .rejects.toMatchObject({ code: 'invalid-url' });
    expect(contacts).toBe(0);
  });

  it('keeps dot-segment requests usable when the base URL is the origin root', async () => {
    const server = await startServer((req, res) => json(res, { url: req.url }));
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path: '../rest/api/content' }))
      .resolves.toEqual({ url: '/rest/api/content' });
  });

  it('connects to an IPv6 loopback base URL', async () => {
    const server = await startServer((_req, res) => json(res, { ok: true }), '', '::1');
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path: '/ipv6' }))
      .resolves.toEqual({ ok: true });
  });

  it('merges default and request headers without mutating either input', async () => {
    const defaults = { Accept: 'application/json', Authorization: 'Bearer secret' };
    const overrides = { Accept: 'application/problem+json', 'X-Test': 'request' };
    const server = await startServer((req, res) => {
      json(res, {
        accept: req.headers.accept,
        authorization: req.headers.authorization,
        test: req.headers['x-test'],
      });
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: defaults });

    await expect(transport.requestJson({
      method: 'GET',
      path: '/headers',
      headers: overrides,
    })).resolves.toEqual({
      accept: 'application/problem+json',
      authorization: 'Bearer secret',
      test: 'request',
    });
    expect(defaults).toEqual({ Accept: 'application/json', Authorization: 'Bearer secret' });
    expect(overrides).toEqual({ Accept: 'application/problem+json', 'X-Test': 'request' });
  });

  it('times out a response that never completes', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: {},
      timeoutMs: 20,
    });

    await expect(transport.requestJson({ method: 'GET', path: '/hang' }))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects an invalid response byte limit: %s',
    (maxResponseBytes) => {
      expect(() => new NodeHttpTransport({
        baseUrl: 'https://confluence.example.test',
        headers: {},
        maxResponseBytes,
      })).toThrow(expect.objectContaining({ code: 'invalid-options' }));
    },
  );

  it('rejects an oversized Content-Length before reading response data and closes the socket', async () => {
    let socketClosed!: () => void;
    const closed = new Promise<void>((resolve) => { socketClosed = resolve; });
    const server = await startServer((_req, res) => {
      res.socket?.once('close', socketClosed);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '11',
      });
      res.flushHeaders();
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: {},
      maxResponseBytes: 10,
      timeoutMs: 100,
    });

    await expect(transport.requestJson({ method: 'GET', path: '/content-length' }))
      .rejects.toMatchObject({ code: 'response-too-large', status: 200 });
    await closed;
  });

  it.each([
    { name: 'redirect', status: 302, headers: { Location: '/login' } },
    { name: 'non-2xx', status: 500, headers: {} },
    { name: 'JSON', status: 200, headers: { 'Content-Type': 'application/json' } },
  ])('limits accumulated chunk bytes for a $name response and closes the socket', async ({ status, headers }) => {
    let socketClosed!: () => void;
    const closed = new Promise<void>((resolve) => { socketClosed = resolve; });
    const server = await startServer((_req, res) => {
      res.socket?.once('close', socketClosed);
      res.writeHead(status, headers);
      res.write('123456');
      setImmediate(() => res.write('789012'));
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: {},
      maxResponseBytes: 10,
      timeoutMs: 100,
    });

    await expect(transport.requestJson({ method: 'GET', path: '/chunked' }))
      .rejects.toMatchObject({ code: 'response-too-large', status });
    await closed;
  });

  it('rejects a request whose signal is already aborted without contacting the server', async () => {
    let contacts = 0;
    const server = await startServer((_req, res) => {
      contacts += 1;
      json(res, {});
    });
    const controller = new AbortController();
    controller.abort();
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({
      method: 'GET',
      path: '/pre-abort',
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(contacts).toBe(0);
  });

  it('aborts an in-flight request', async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const server = await startServer(() => requestStarted());
    const controller = new AbortController();
    const request = new NodeHttpTransport({
      baseUrl: server.url,
      headers: {},
      timeoutMs: 1_000,
    }).requestJson({ method: 'GET', path: '/abort', signal: controller.signal });
    await started;
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'aborted' });
  });

  it('rejects a response that is interrupted after headers arrive', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '100',
      });
      res.write('{"partial":');
      setImmediate(() => res.destroy(new Error('server-side secret detail')));
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path: '/interrupted' }))
      .rejects.toMatchObject({ code: 'network' });
  });

  it('rejects redirects without following them and reports the location', async () => {
    let redirected = false;
    const server = await startServer((req, res) => {
      if (req.url === '/login') {
        redirected = true;
        json(res, {});
        return;
      }
      res.writeHead(302, { Location: '/login' });
      res.end();
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: { Authorization: 'Bearer super-secret' },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/redirect' });
      throw new Error('expected redirect to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'redirect', status: 302 });
      expect((error as Error).message).toContain('/login');
      expect((error as Error).message).not.toContain('super-secret');
    }
    expect(redirected).toBe(false);
  });

  it('limits non-2xx response text to 300 characters and omits credentials', async () => {
    const responseText = `failure:${'x'.repeat(400)}`;
    const server = await startServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(responseText);
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: { Authorization: 'Bearer super-secret' },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/failure' });
      throw new Error('expected HTTP request to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'http', status: 500 });
      expect((error as Error).message).toContain(responseText.slice(0, 300));
      expect((error as Error).message).not.toContain(responseText.slice(0, 301));
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  it('redacts a sensitive outgoing header when the server reflects it', async () => {
    const server = await startServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end(`received ${req.headers.authorization}`);
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: { Authorization: 'Bearer super-secret' },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/reflected-secret' });
      throw new Error('expected HTTP request to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'http', status: 401 });
      expect((error as Error).message).toContain('[REDACTED]');
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  it('redacts bearer, proxy, cookie, unknown-scheme, and percent-encoded credentials', async () => {
    const secrets = [
      'bearer/token+plus',
      'bearer%2Ftoken%2Bplus',
      'proxy-secret',
      'cookie-secret',
    ];
    const server = await startServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end(`received ${secrets.join(' ')}`);
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: {
        Authorization: 'Bearer bearer/token+plus',
        'Proxy-Authorization': 'Custom proxy-secret',
        Cookie: 'session=cookie-secret; theme=dark',
      },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/credential-variants' });
      throw new Error('expected HTTP request to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'http', status: 401 });
      const message = (error as Error).message;
      expect(message).toContain('[REDACTED]');
      for (const secret of secrets) expect(message).not.toContain(secret);
    }
  });

  it('redacts a decoded Basic password from diagnostics', async () => {
    const authorization = `Basic ${Buffer.from('alice:basic-password').toString('base64')}`;
    const server = await startServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('credentials alice:basic-password basic-password basic-password%2Fencoded');
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: { Authorization: authorization },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/basic-password' });
      throw new Error('expected HTTP request to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'http', status: 401 });
      const message = (error as Error).message;
      expect(message).toContain('[REDACTED]');
      expect(message).not.toContain('basic-password');
      expect(message).not.toContain('basic-password%2Fencoded');
    }
  });

  it('redacts encoded credentials from a redirect location while retaining a safe path', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(302, { Location: '/login/redirect%2Fsecret' });
      res.end();
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: { Authorization: 'Bearer redirect/secret' },
    });

    try {
      await transport.requestJson({ method: 'GET', path: '/redirect-secret' });
      throw new Error('expected redirect to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'redirect', status: 302 });
      const message = (error as Error).message;
      expect(message).toContain('/login/');
      expect(message).toContain('[REDACTED]');
      expect(message).not.toContain('redirect/secret');
      expect(message).not.toContain('redirect%2Fsecret');
    }
  });

  it('rejects successful responses whose content type is not JSON', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('{"looks":"json"}');
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path: '/html' }))
      .rejects.toMatchObject({ code: 'content-type', status: 200 });
  });

  it('accepts structured JSON content types', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/problem+json' });
      res.end('{"type":"example"}');
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestJson({ method: 'GET', path: '/problem' }))
      .resolves.toEqual({ type: 'example' });
  });

  it('returns a typed error for malformed JSON without exposing the body', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"token":"super-secret"');
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    try {
      await transport.requestJson({ method: 'GET', path: '/malformed' });
      throw new Error('expected JSON parsing to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'json', status: 200 });
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  it('supports DELETE bodies and requestEmpty responses without JSON headers', async () => {
    let received = '';
    const server = await startServer((req, res) => {
      expect(req.headers['content-length']).toBe(String(Buffer.byteLength('{"reason":"rollback"}')));
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => { received += chunk; });
      req.on('end', () => {
        expect(req.method).toBe('DELETE');
        res.writeHead(204);
        res.end();
      });
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestEmpty({
      method: 'DELETE',
      path: '/rest/api/content/42',
      body: '{"reason":"rollback"}',
    })).resolves.toBeUndefined();
    expect(received).toBe('{"reason":"rollback"}');
  });

  it('frames Uint8Array bodies by byte length', async () => {
    const body = new TextEncoder().encode('binary-body');
    const server = await startServer((req, res) => {
      expect(req.headers['content-length']).toBe(String(body.byteLength));
      req.resume();
      req.on('end', () => {
        res.writeHead(204);
        res.end();
      });
    });
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });

    await expect(transport.requestEmpty({ method: 'PUT', path: '/bytes', body }))
      .resolves.toBeUndefined();
  });

  it('preserves caller-provided framing headers and header inputs', async () => {
    const defaultHeaders = { Accept: 'application/json' };
    const requestHeaders = { 'tRaNsFeR-EnCoDiNg': 'chunked' };
    const server = await startServer((req, res) => {
      expect(req.headers['transfer-encoding']).toBe('chunked');
      expect(req.headers['content-length']).toBeUndefined();
      req.resume();
      req.on('end', () => {
        res.writeHead(204);
        res.end();
      });
    });
    const transport = new NodeHttpTransport({
      baseUrl: server.url,
      headers: defaultHeaders,
    });

    await expect(transport.requestEmpty({
      method: 'DELETE',
      path: '/caller-framed',
      headers: requestHeaders,
      body: 'body',
    })).resolves.toBeUndefined();
    expect(defaultHeaders).toEqual({ Accept: 'application/json' });
    expect(requestHeaders).toEqual({ 'tRaNsFeR-EnCoDiNg': 'chunked' });
  });

  it('settles once when an abort arrives after a completed response', async () => {
    const server = await startServer((_req, res) => json(res, { ok: true }));
    const controller = new AbortController();
    const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {} });
    const request = transport.requestJson({
      method: 'GET',
      path: '/complete',
      signal: controller.signal,
    });

    await expect(request).resolves.toEqual({ ok: true });
    controller.abort();
    await expect(request).resolves.toEqual({ ok: true });
  });
});
