export interface ConfluencePageResponse {
  id: string;
  title: string;
  space?: { key: string };
  ancestors?: Array<{ id: string }>;
  version: { number: number };
  _links?: { webui?: string };
  metadata?: {
    properties?: {
      'obsidian-confluence-publisher'?: {
        id: string;
        value: unknown;
        version?: { number: number };
      };
    };
  };
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

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

/**
 * Discriminated union describing each step of the publish pipeline.
 * UI consumers (progress modals, status bars) switch on `type` to render
 * appropriate feedback.
 */
export type ProgressEvent =
	| { type: 'start'; total: number }
	| { type: 'page_created'; title: string; index: number }
	| { type: 'image_uploaded'; filename: string }
	| { type: 'page_updated'; title: string; index: number }
	| { type: 'error'; title: string; error: string }
	| {
			type: 'complete';
			succeeded: number;
			failed: number;
			skipped: number;
	  };
