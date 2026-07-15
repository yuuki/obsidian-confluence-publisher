import * as nodeHttp from 'http';
import * as nodeHttps from 'https';

export type TransportErrorCode =
  | 'invalid-url'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'redirect'
  | 'http'
  | 'content-type'
  | 'json';

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export interface JsonRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

export interface NodeHttpTransportOptions {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function validateConfluenceBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TransportError('invalid-url', 'Confluence URL is invalid.');
  }

  const loopback = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]'
    || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new TransportError(
      'invalid-url',
      'Confluence URL must use HTTPS unless it targets loopback.',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TransportError(
      'invalid-url',
      'Confluence URL must not contain credentials, a query, or a fragment.',
    );
  }
  return url;
}

export class NodeHttpTransport {
  private readonly baseUrl: URL;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: NodeHttpTransportOptions) {
    this.baseUrl = validateConfluenceBaseUrl(options.baseUrl);
    this.headers = { ...options.headers };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  requestJson<T>(request: JsonRequest): Promise<T> {
    return this.request(request, true) as Promise<T>;
  }

  requestEmpty(request: JsonRequest): Promise<void> {
    return this.request(request, false) as Promise<void>;
  }

  private request(request: JsonRequest, expectJson: boolean): Promise<unknown> {
    if (request.signal?.aborted) {
      return Promise.reject(new TransportError('aborted', 'Confluence request was cancelled.'));
    }

    const url = joinRequestUrl(this.baseUrl, request.path);
    const transport = url.protocol === 'https:' ? nodeHttps : nodeHttp;
    const headers = { ...this.headers, ...request.headers };
    if (
      request.body !== undefined
      && !hasHeader(headers, 'content-length')
      && !hasHeader(headers, 'transfer-encoding')
    ) {
      headers['Content-Length'] = String(
        typeof request.body === 'string'
          ? Buffer.byteLength(request.body)
          : request.body.byteLength,
      );
    }

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
      };
      const succeed = (value: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const fail = (error: TransportError): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abort = (): void => {
        fail(new TransportError('aborted', 'Confluence request was cancelled.'));
        req.destroy();
      };

      const req = transport.request({
        protocol: url.protocol,
        hostname: unbracketHostname(url.hostname),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
      }, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer | Uint8Array | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.once('aborted', () => {
          fail(new TransportError('network', 'Confluence response was interrupted.'));
        });
        response.once('error', () => {
          fail(new TransportError('network', 'Confluence response failed.'));
        });
        response.once('end', () => {
          if (settled) return;
          const status = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString('utf8');

          if (status >= 300 && status < 400) {
            const location = safeRedirectLocation(response.headers.location, url);
            fail(new TransportError(
              'redirect',
              location
                ? `Confluence redirected the request to ${location}. Check the configured URL and authentication.`
                : 'Confluence redirected the request. Check the configured URL and authentication.',
              status,
            ));
            return;
          }
          if (status < 200 || status >= 300) {
            fail(new TransportError(
              'http',
              `Confluence request failed (${status}): ${redactSensitiveHeaders(body, headers).slice(0, 300)}`,
              status,
            ));
            return;
          }
          if (!expectJson) {
            succeed(undefined);
            return;
          }

          const contentType = String(response.headers['content-type'] ?? '');
          if (!isJsonContentType(contentType)) {
            fail(new TransportError(
              'content-type',
              'Confluence returned a successful response that was not JSON.',
              status,
            ));
            return;
          }
          try {
            succeed(JSON.parse(body));
          } catch {
            fail(new TransportError(
              'json',
              'Confluence returned malformed JSON.',
              status,
            ));
          }
        });
      });

      req.once('error', () => {
        fail(new TransportError('network', 'Confluence request failed at the network layer.'));
      });
      request.signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        fail(new TransportError('timeout', 'Confluence request timed out.'));
        req.destroy();
      }, this.timeoutMs);

      if (request.body !== undefined) req.write(request.body);
      req.end();
    });
  }
}

function joinRequestUrl(baseUrl: URL, path: string): URL {
  const url = new URL(baseUrl.toString());
  const question = path.indexOf('?');
  const pathname = question === -1 ? path : path.slice(0, question);
  const search = question === -1 ? '' : path.slice(question);
  const contextPath = url.pathname.replace(/\/+$/, '');
  const requestPath = pathname.replace(/^\/+/, '');
  url.pathname = `${contextPath}/${requestPath}` || '/';
  url.search = search;
  url.hash = '';
  return url;
}

function isJsonContentType(contentType: string): boolean {
  return /^application\/(?:[A-Za-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType);
}

function hasHeader(headers: Record<string, string>, expectedName: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === expectedName);
}

function unbracketHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function safeRedirectLocation(location: string | undefined, requestUrl: URL): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, requestUrl);
    return location.startsWith('/') ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function redactSensitiveHeaders(body: string, headers: Record<string, string>): string {
  const sensitiveNames = new Set(['authorization', 'proxy-authorization', 'cookie']);
  let redacted = body;
  for (const [name, value] of Object.entries(headers)) {
    if (!sensitiveNames.has(name.toLowerCase()) || value.length === 0) continue;
    redacted = redacted.split(value).join('[REDACTED]');
  }
  return redacted;
}
