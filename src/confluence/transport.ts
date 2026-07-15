import * as nodeHttp from 'http';
import * as nodeHttps from 'https';

export type TransportErrorCode =
  | 'invalid-url'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'invalid-options'
  | 'response-too-large'
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
  maxResponseBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

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
  private readonly maxResponseBytes: number;

  constructor(options: NodeHttpTransportOptions) {
    this.baseUrl = validateConfluenceBaseUrl(options.baseUrl);
    this.headers = { ...options.headers };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0) {
      throw new TransportError(
        'invalid-options',
        'Confluence response byte limit must be a positive safe integer.',
      );
    }
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

    let url: URL;
    try {
      url = joinRequestUrl(this.baseUrl, request.path);
    } catch (error) {
      return Promise.reject(error);
    }
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
        const status = response.statusCode ?? 0;
        let receivedBytes = 0;

        const failResponseTooLarge = (): void => {
          if (settled) return;
          fail(new TransportError(
            'response-too-large',
            'Confluence response exceeded the configured byte limit.',
            status,
          ));
          response.destroy();
          req.destroy();
        };

        response.on('data', (chunk: Buffer | Uint8Array | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.byteLength;
          if (receivedBytes > this.maxResponseBytes) {
            failResponseTooLarge();
            return;
          }
          chunks.push(buffer);
        });
        response.once('aborted', () => {
          fail(new TransportError('network', 'Confluence response was interrupted.'));
        });
        response.once('error', () => {
          fail(new TransportError('network', 'Confluence response failed.'));
        });
        const contentLength = parseContentLength(response.headers['content-length']);
        if (contentLength !== null && contentLength > this.maxResponseBytes) {
          failResponseTooLarge();
          return;
        }
        response.once('end', () => {
          if (settled) return;
          const body = Buffer.concat(chunks).toString('utf8');

          if (status >= 300 && status < 400) {
            const rawLocation = safeRedirectLocation(response.headers.location, url);
            const location = rawLocation === null
              ? null
              : sanitizeDiagnostic(rawLocation, headers);
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
              `Confluence request failed (${status}): ${sanitizeDiagnostic(body, headers).slice(0, 300)}`,
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
  if (/%(?:2f|5c)/i.test(pathname)) {
    throw new TransportError(
      'invalid-url',
      'Confluence request pathname must not contain encoded path separators.',
    );
  }
  const contextPath = url.pathname.replace(/\/+$/, '');
  const requestPath = pathname.replace(/^\/+/, '');
  url.pathname = `${contextPath}/${requestPath}` || '/';
  url.search = search;
  url.hash = '';
  if (
    contextPath !== ''
    && url.pathname !== contextPath
    && !url.pathname.startsWith(`${contextPath}/`)
  ) {
    throw new TransportError(
      'invalid-url',
      'Confluence request path must stay within the configured context path.',
    );
  }
  return url;
}

function isJsonContentType(contentType: string): boolean {
  return /^application\/(?:[A-Za-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType);
}

function parseContentLength(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
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

function sanitizeDiagnostic(value: string, headers: Record<string, string>): string {
  const secrets = collectCredentialSecrets(headers)
    .flatMap(credentialVariants)
    .filter((secret, index, values) => secret.length > 0 && values.indexOf(secret) === index)
    .sort((left, right) => right.length - left.length);
  return secrets.reduce(
    (sanitized, secret) => sanitized.replace(
      new RegExp(escapeRegExp(secret), 'gi'),
      '[REDACTED]',
    ),
    value,
  );
}

function collectCredentialSecrets(headers: Record<string, string>): string[] {
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (lowerName === 'cookie') {
      secrets.push(value);
      for (const pair of value.split(';')) {
        const trimmed = pair.trim();
        if (trimmed.length === 0) continue;
        secrets.push(trimmed);
        const equals = trimmed.indexOf('=');
        if (equals !== -1) secrets.push(unquote(trimmed.slice(equals + 1).trim()));
      }
      continue;
    }
    if (lowerName !== 'authorization' && lowerName !== 'proxy-authorization') continue;

    secrets.push(value);
    const match = /^\s*(\S+)(?:\s+([\s\S]+))?$/.exec(value);
    const scheme = match?.[1]?.toLowerCase();
    const credential = match?.[2]?.trim();
    if (!credential) continue;
    secrets.push(credential);
    if (scheme === 'basic') {
      const decoded = Buffer.from(credential, 'base64').toString('utf8');
      if (decoded.length > 0) secrets.push(decoded);
      const colon = decoded.indexOf(':');
      if (colon !== -1) secrets.push(decoded.slice(colon + 1));
    }
  }
  return secrets;
}

function credentialVariants(secret: string): string[] {
  const variants = [secret, encodeURIComponent(secret)];
  try {
    const decoded = decodeURIComponent(secret);
    if (decoded !== secret) variants.push(decoded, encodeURIComponent(decoded));
  } catch {
    // Invalid percent escapes are still removed through the original value.
  }
  return variants;
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
