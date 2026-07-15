export interface ConfluencePageResponse {
  id: string;
  title: string;
  space?: { key: string };
  ancestors?: Array<{ id: string }>;
  version: { number: number };
  _links?: { webui?: string };
}

export interface ConfluenceAttachmentResponse {
  id: string;
  title: string;
  metadata?: { mediaType?: string };
}

export interface ConfluencePageCollection<T> {
  results: T[];
  size: number;
  _links?: { next?: string };
}
