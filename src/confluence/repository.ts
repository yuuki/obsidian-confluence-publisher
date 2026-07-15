import {
  PAGE_OWNERSHIP_PROPERTY,
  type PageOwnership,
  type PublishRepository,
  type ResolvedPage,
} from '../domain/publication';
import { NodeHttpTransport, TransportError } from './transport';
import type {
  ConfluenceAttachmentResponse,
  ConfluencePageCollection,
  ConfluencePageResponse,
} from './types';

const PAGE_EXPAND = 'version,ancestors,space,metadata.properties.obsidian-confluence-publisher';
const ATTACHMENT_LIMIT = 100;

export class ConfluenceRepository implements PublishRepository {
  private readonly attachmentCache = new Map<string, Map<string, ConfluenceAttachmentResponse>>();
  private readonly uploadedAttachmentAliases = new Map<string, Map<string, ConfluenceAttachmentResponse>>();

  constructor(private readonly transport: NodeHttpTransport) {}

  async getPage(pageId: string, signal: AbortSignal): Promise<ResolvedPage | null> {
    try {
      const page = await this.transport.requestJson<unknown>({
        method: 'GET',
        path: `/rest/api/content/${encodeURIComponent(pageId)}?expand=${encodeURIComponent(PAGE_EXPAND)}`,
        signal,
      });
      return resolvePage(page);
    } catch (error) {
      if (error instanceof TransportError && error.status === 404) return null;
      throw error;
    }
  }

  async findPagesByTitle(
    spaceKey: string,
    title: string,
    signal: AbortSignal,
  ): Promise<ResolvedPage[]> {
    const query = new URLSearchParams({
      type: 'page',
      spaceKey,
      title,
      expand: PAGE_EXPAND,
      limit: String(ATTACHMENT_LIMIT),
    });
    let path: string | undefined = `/rest/api/content?${query.toString()}`;
    const visited = new Set<string>();
    const pages: ResolvedPage[] = [];

    while (path !== undefined) {
      assertUnvisited(path, visited, 'page search');
      const collection: ConfluencePageCollection<ConfluencePageResponse> = pageCollection<ConfluencePageResponse>(await this.transport.requestJson<unknown>({
        method: 'GET', path, signal,
      }), isPageResponse, 'page');
      pages.push(...collection.results.map((page) => resolvePage(page)));
      path = collection._links?.next;
    }
    return pages;
  }

  async createPage(
    spaceKey: string,
    parentId: string,
    title: string,
    body: string,
    signal: AbortSignal,
  ): Promise<ResolvedPage> {
    const page = await this.transport.requestJson<unknown>({
      method: 'POST',
      path: '/rest/api/content',
      body: JSON.stringify({
        type: 'page',
        title,
        space: { key: spaceKey },
        ancestors: [{ id: parentId }],
        body: { storage: { value: body, representation: 'storage' } },
      }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    return resolvePage(page, { spaceKey, parentPageId: parentId });
  }

  async setPageOwnership(
    pageId: string,
    ownership: PageOwnership,
    signal: AbortSignal,
  ): Promise<void> {
    await this.transport.requestJson<unknown>({
      method: 'POST',
      path: `/rest/api/content/${encodeURIComponent(pageId)}/property`,
      body: JSON.stringify({ key: PAGE_OWNERSHIP_PROPERTY, value: ownership }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
  }

  async deletePage(pageId: string, signal: AbortSignal): Promise<void> {
    await this.transport.requestEmpty({
      method: 'DELETE', path: `/rest/api/content/${encodeURIComponent(pageId)}`, signal,
    });
  }

  async updatePage(
    pageId: string,
    title: string,
    body: string,
    currentVersion: number,
    signal: AbortSignal,
  ): Promise<void> {
    await this.transport.requestEmpty({
      method: 'PUT',
      path: `/rest/api/content/${encodeURIComponent(pageId)}`,
      body: JSON.stringify({
        type: 'page',
        title,
        version: { number: currentVersion + 1 },
        body: { storage: { value: body, representation: 'storage' } },
      }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
  }

  async listAttachments(
    pageId: string,
    signal: AbortSignal,
  ): Promise<Map<string, ConfluenceAttachmentResponse>> {
    const cached = this.attachmentCache.get(pageId);
    if (cached !== undefined) return cached;

    let path: string | undefined = `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=${ATTACHMENT_LIMIT}&expand=metadata`;
    const visited = new Set<string>();
    const attachments = new Map<string, ConfluenceAttachmentResponse>();
    while (path !== undefined) {
      assertUnvisited(path, visited, 'attachment listing');
      const collection: ConfluencePageCollection<ConfluenceAttachmentResponse> = pageCollection<ConfluenceAttachmentResponse>(await this.transport.requestJson<unknown>({
        method: 'GET', path, signal,
      }), isAttachmentResponse, 'attachment');
      for (const attachment of collection.results) {
        attachments.set(attachment.title, attachment);
      }
      path = collection._links?.next;
    }

    this.attachmentCache.set(pageId, attachments);
    return attachments;
  }

  async putAttachment(
    pageId: string,
    filename: string,
    data: ArrayBuffer,
    mimeType: string,
    signal: AbortSignal,
  ): Promise<'created' | 'updated'> {
    const multipart = buildMultipart(filename, data, mimeType);
    const attachments = await this.listAttachments(pageId, signal);
    const existing = attachments.get(filename)
      ?? this.uploadedAttachmentAliases.get(pageId)?.get(filename);
    const encodedPageId = encodeURIComponent(pageId);
    const path = existing === undefined
      ? `/rest/api/content/${encodedPageId}/child/attachment`
      : `/rest/api/content/${encodedPageId}/child/attachment/${encodeURIComponent(existing.id)}/data`;
    const response = await this.transport.requestJson<unknown>({
      method: 'POST',
      path,
      body: multipart.body,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
        'X-Atlassian-Token': 'nocheck',
      },
      signal,
    });
    const returned = attachmentFromUpload(response);
    if (existing !== undefined) {
      attachments.delete(filename);
      attachments.delete(existing.title);
    }
    attachments.set(returned.title, returned);
    let aliases = this.uploadedAttachmentAliases.get(pageId);
    if (aliases === undefined) {
      aliases = new Map<string, ConfluenceAttachmentResponse>();
      this.uploadedAttachmentAliases.set(pageId, aliases);
    }
    aliases.set(filename, returned);
    return existing === undefined ? 'created' : 'updated';
  }
}

function resolvePage(
  value: unknown,
  fallback?: { spaceKey: string; parentPageId: string },
): ResolvedPage {
  if (!isPageResponse(value)) throw new Error('Confluence returned an invalid page response.');
  const page = value;
  const ancestors = page.ancestors ?? [];
  return {
    id: page.id,
    title: page.title,
    spaceKey: page.space?.key ?? fallback?.spaceKey ?? '',
    parentPageId: ancestors.length === 0
      ? fallback?.parentPageId ?? null
      : ancestors[ancestors.length - 1]?.id ?? null,
    version: page.version.number,
    webui: page._links?.webui ?? null,
    ownership: readOwnership(page),
  };
}

function readOwnership(page: ConfluencePageResponse): PageOwnership | null {
  const properties = page.metadata?.properties;
  if (properties === undefined || !Object.prototype.hasOwnProperty.call(properties, PAGE_OWNERSHIP_PROPERTY)) {
    return null;
  }
  const value = properties[PAGE_OWNERSHIP_PROPERTY]?.value;
  if (
    typeof value !== 'object'
    || value === null
    || !('schemaVersion' in value)
    || value.schemaVersion !== 1
    || !('destinationId' in value)
    || typeof value.destinationId !== 'string'
    || value.destinationId.length === 0
    || !('sourcePath' in value)
    || typeof value.sourcePath !== 'string'
    || value.sourcePath.length === 0
  ) {
    throw new Error(`Confluence page ${page.id} has invalid ownership property data.`);
  }
  return {
    schemaVersion: 1,
    destinationId: value.destinationId,
    sourcePath: value.sourcePath,
  };
}

function assertUnvisited(path: string, visited: Set<string>, operation: string): void {
  if (visited.has(path)) throw new Error(`Confluence returned a pagination cycle during ${operation}.`);
  visited.add(path);
}

function attachmentFromUpload(response: unknown): ConfluenceAttachmentResponse {
  const attachment = isRecord(response) && 'results' in response
    ? pageCollection(response, isAttachmentResponse, 'attachment').results[0]
    : response;
  if (attachment === undefined) throw new Error('Confluence attachment upload returned no attachment.');
  if (!isAttachmentResponse(attachment)) {
    throw new Error('Confluence returned an invalid attachment response.');
  }
  return attachment;
}

function buildMultipart(
  filename: string,
  data: ArrayBuffer,
  mimeType: string,
): { boundary: string; body: Uint8Array } {
  const quotedFilename = quoteMultipartFilename(filename);
  if (/[\r\n]/.test(mimeType)) throw new Error('Attachment MIME type contains a line break.');
  if (/[\x00-\x1f\x7f]/.test(mimeType)) {
    throw new Error('Attachment MIME type contains a control character.');
  }
  const fileBytes = new Uint8Array(data);
  let boundary = '----obsidian-confluence-publisher-1';
  while (containsBytes(fileBytes, new TextEncoder().encode(boundary))) boundary += '-1';
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${quotedFilename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + fileBytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(fileBytes, prefix.length);
  body.set(suffix, prefix.length + fileBytes.length);
  return { boundary, body };
}

function quoteMultipartFilename(filename: string): string {
  if (/[\r\n]/.test(filename)) throw new Error('Attachment filename contains a line break.');
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    throw new Error('Attachment filename contains a control character.');
  }
  return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pageCollection<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
  itemName: string,
): ConfluencePageCollection<T> {
  if (
    !isRecord(value)
    || !Array.isArray(value.results)
    || !value.results.every(isItem)
    || typeof value.size !== 'number'
  ) {
    throw new Error(`Confluence returned an invalid ${itemName} collection response.`);
  }
  if (value._links !== undefined && (
    !isRecord(value._links)
    || (value._links.next !== undefined && typeof value._links.next !== 'string')
  )) {
    throw new Error(`Confluence returned an invalid ${itemName} collection response.`);
  }
  return value as unknown as ConfluencePageCollection<T>;
}

function isPageResponse(value: unknown): value is ConfluencePageResponse {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || value.id.length === 0
    || typeof value.title !== 'string'
    || !isRecord(value.version)
    || typeof value.version.number !== 'number'
    || !Number.isSafeInteger(value.version.number)
  ) return false;
  if (value.space !== undefined && (!isRecord(value.space) || typeof value.space.key !== 'string')) return false;
  if (value.ancestors !== undefined && (
    !Array.isArray(value.ancestors)
    || !value.ancestors.every((ancestor) => isRecord(ancestor) && typeof ancestor.id === 'string')
  )) return false;
  return true;
}

function isAttachmentResponse(value: unknown): value is ConfluenceAttachmentResponse {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}
