/**
 * Confluence REST API response types for Server/DC.
 *
 * These types model the subset of the Confluence REST API v1 that the
 * publisher plugin relies on.  Field names match the JSON keys returned
 * by the server so they can be used directly with type-safe fetch helpers.
 */

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface ConfluencePage {
	id: string;
	type: string;
	status: string;
	title: string;
	version: { number: number };
	_links: { webui: string };
}

export interface ConfluenceSearchResult {
	results: ConfluencePage[];
	size: number;
}

export interface ConfluenceAttachment {
	id: string;
	title: string;
	metadata: { mediaType: string };
}

// ---------------------------------------------------------------------------
// Internal domain types
// ---------------------------------------------------------------------------

/** A reference to an image embedded in an Obsidian note. */
export interface ImageRef {
	/** The original markdown/wiki-link syntax found in the note body. */
	originalSyntax: string;
	/** The filename portion extracted from the link (e.g. "diagram.png"). */
	filename: string;
	/**
	 * Absolute or vault-relative path resolved by Obsidian's link resolver.
	 * `null` when the target file could not be located in the vault.
	 */
	resolvedPath: string | null;
	/** Explicit width parsed from the syntax (e.g. `|400`), or `null`. */
	width: number | null;
}

/** All information about a single note that is about to be published. */
export interface PageInfo {
	/** Vault-relative path of the source markdown file. */
	sourcePath: string;
	/** Title that will be used as the Confluence page title. */
	title: string;
	/** Parsed YAML frontmatter key/value pairs. */
	frontmatter: Record<string, unknown>;
	/** Markdown body (after optional frontmatter stripping). */
	content: string;
	/**
	 * Existing Confluence page ID when the note has been published before,
	 * stored in frontmatter as `confluence_id`.  `null` for first publish.
	 */
	confluenceId: string | null;
	/** Image references discovered in the note body. */
	images: ImageRef[];
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
