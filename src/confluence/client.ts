import { ConfluencePage, ConfluenceSearchResult } from './types';

// Node.js built-in modules — available in Obsidian desktop (Electron).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeHttps = require('https') as typeof import('https');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeHttp = require('http') as typeof import('http');

interface ApiResponse {
  status: number;
  text: string;
  json: unknown;
  headers: Record<string, string>;
}

/**
 * REST API client for Confluence Server / Data Center (v1).
 *
 * Uses Node.js `https` module directly (instead of Obsidian's `requestUrl`)
 * so that HTTP redirects are NOT followed automatically. This prevents the
 * Authorization header from being silently stripped on redirect, which causes
 * Confluence to return an HTML login page instead of JSON.
 */
export class ConfluenceClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    confluenceUrl: string,
    authType: 'pat' | 'basic',
    token: string,
    username: string,
    password: string,
  ) {
    this.baseUrl = confluenceUrl.replace(/\/+$/, '');

    let authValue: string;
    if (authType === 'pat') {
      authValue = `Bearer ${token}`;
    } else {
      const bytes = new TextEncoder().encode(`${username}:${password}`);
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
      authValue = `Basic ${btoa(binary)}`;
    }

    this.headers = {
      'Authorization': authValue,
      'Accept': 'application/json',
    };
  }

  /** Extra headers for mutating requests (POST/PUT/DELETE). */
  private get mutationHeaders(): Record<string, string> {
    return {
      ...this.headers,
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'nocheck',
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async findPageByTitle(spaceKey: string, title: string): Promise<string | null> {
    const params = new URLSearchParams({
      spaceKey,
      title,
      type: 'page',
      expand: 'version',
    });

    const url = `${this.baseUrl}/rest/api/content?${params.toString()}`;
    const response = await this.request({ url, method: 'GET' });
    const data = response.json as ConfluenceSearchResult;

    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
    return null;
  }

  /**
   * List filenames of existing attachments on a page.
   */
  async getAttachmentFilenames(pageId: string): Promise<Set<string>> {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=500`;
    const response = await this.request({ url, method: 'GET' });
    const data = response.json as { results: { title: string }[] };
    return new Set((data.results || []).map((a) => a.title));
  }

  async getPage(pageId: string): Promise<ConfluencePage> {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=version,ancestors`;
    const response = await this.request({ url, method: 'GET' });
    return response.json as ConfluencePage;
  }

  async createPage(
    spaceKey: string,
    parentId: string,
    title: string,
    body: string,
  ): Promise<ConfluencePage> {
    const url = `${this.baseUrl}/rest/api/content`;
    const payload = {
      type: 'page',
      title,
      space: { key: spaceKey },
      ancestors: [{ id: parentId }],
      body: {
        storage: {
          value: body,
          representation: 'storage',
        },
      },
    };

    const response = await this.request({
      url,
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json as ConfluencePage;
  }

  async updatePage(
    pageId: string,
    title: string,
    body: string,
    version: number,
  ): Promise<void> {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}`;
    const payload = {
      type: 'page',
      title,
      body: {
        storage: {
          value: body,
          representation: 'storage',
        },
      },
      version: {
        number: version + 1,
      },
    };

    await this.request({
      url,
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Upload (or update) a file attachment on a page.
   *
   * Uses Node.js https directly (same as other methods) to avoid the
   * redirect / auth-header-stripping issue with Obsidian's requestUrl.
   */
  async uploadAttachment(
    pageId: string,
    filename: string,
    data: ArrayBuffer,
    mimeType: string,
  ): Promise<void> {
    const boundary = `----ObsidianConfluence${Date.now()}${Math.random().toString(36).slice(2)}`;

    const headerPart =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `\r\n`;

    const footerPart = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(headerPart);
    const footerBytes = new TextEncoder().encode(footerPart);
    const fileBytes = new Uint8Array(data);

    const combined = new Uint8Array(
      headerBytes.byteLength + fileBytes.byteLength + footerBytes.byteLength,
    );
    combined.set(headerBytes, 0);
    combined.set(fileBytes, headerBytes.byteLength);
    combined.set(footerBytes, headerBytes.byteLength + fileBytes.byteLength);

    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`;
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? nodeHttps : nodeHttp;

    const reqHeaders: Record<string, string> = {
      ...this.headers,
      'X-Atlassian-Token': 'nocheck',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(combined.byteLength),
    };

    console.log(`[confluence-publisher] POST ${url} (attachment: ${filename})`);

    await new Promise<void>((resolve, reject) => {
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: reqHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            console.log(`[confluence-publisher] Attachment response: ${status}`);

            if (status >= 200 && status < 300) {
              resolve();
            } else {
              const body = Buffer.concat(chunks).toString('utf-8').slice(0, 300);
              reject(new Error(`Attachment upload failed (${status}): ${body}`));
            }
          });
        },
      );

      req.on('error', (err: Error) => {
        reject(new Error(`Network error uploading attachment: ${err.message}`));
      });

      req.write(Buffer.from(combined.buffer, combined.byteOffset, combined.byteLength));
      req.end();
    });
  }

  async testConnection(spaceKey: string): Promise<boolean> {
    const url = `${this.baseUrl}/rest/api/space/${encodeURIComponent(spaceKey)}`;
    try {
      await this.request({ url, method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal — Node.js https (no auto-redirect, matches curl behaviour)
  // ---------------------------------------------------------------------------

  private async request(params: {
    url: string;
    method: string;
    body?: string;
  }): Promise<ApiResponse> {
    const isMutation = params.method !== 'GET' && params.method !== 'HEAD';
    const reqHeaders = isMutation ? this.mutationHeaders : this.headers;

    console.log(`[confluence-publisher] ${params.method} ${params.url}`);

    const parsed = new URL(params.url);
    const mod = parsed.protocol === 'https:' ? nodeHttps : nodeHttp;

    return new Promise<ApiResponse>((resolve, reject) => {
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: params.method,
          headers: reqHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            const status = res.statusCode ?? 0;
            const ct = (res.headers['content-type'] as string) ?? '';

            console.log(
              `[confluence-publisher] Response: ${status}, content-type: ${ct}`,
            );

            const responseHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === 'string') responseHeaders[k] = v;
            }

            // Detect redirects (Node.js https does NOT auto-follow them)
            if (status >= 300 && status < 400) {
              reject(
                new Error(
                  `Confluence returned redirect (${status}) to: ${res.headers.location ?? 'unknown'}. ` +
                    `This usually means authentication failed or the URL needs adjustment. ` +
                    `Check your credentials and Confluence URL.`,
                ),
              );
              return;
            }

            // HTTP errors
            if (status < 200 || status >= 300) {
              let detail = text.slice(0, 200);
              try {
                const body = JSON.parse(text);
                if (body.message) detail = body.message;
                else if (body.data?.message) detail = body.data.message;
              } catch {
                // not JSON
              }
              reject(new Error(`Confluence API error ${status}: ${detail}`));
              return;
            }

            // Guard against non-JSON responses
            if (text && !ct.includes('application/json')) {
              reject(
                new Error(
                  `Confluence returned non-JSON response (content-type: ${ct || 'unknown'}). ` +
                    `URL: ${params.url} — ` +
                    `Response preview: ${text.slice(0, 300)}`,
                ),
              );
              return;
            }

            let json: unknown;
            try {
              json = text ? JSON.parse(text) : undefined;
            } catch (e) {
              reject(
                new Error(
                  `Failed to parse Confluence JSON: ${e instanceof Error ? e.message : String(e)}. ` +
                    `Preview: ${text.slice(0, 200)}`,
                ),
              );
              return;
            }

            resolve({ status, text, json, headers: responseHeaders });
          });
        },
      );

      req.on('error', (err: Error) => {
        reject(
          new Error(`Network error connecting to Confluence: ${err.message}`),
        );
      });

      if (params.body) req.write(params.body);
      req.end();
    });
  }
}
