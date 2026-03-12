import { App, TFile } from 'obsidian';
import { ImageRef } from '../confluence/types';

interface PreprocessResult {
  content: string;
  images: ImageRef[];
}

/** Image file extensions recognized by Obsidian embeds. */
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|svg|webp)$/i;

/**
 * Pre-process Obsidian-specific markdown syntax.
 *
 * Replaces wikilinks, image embeds, and callouts with Confluence storage
 * format XML so that subsequent standard Markdown-to-HTML conversion can
 * pass them through untouched.
 *
 * Processing order matters:
 *   1. Image embeds  (![[file.png]]  / ![[file.png|600]])
 *   2. Note embeds   (![[Note Name]])
 *   3. Wikilinks      ([[Page]]      / [[Page|alias]])
 *   4. Callouts       (> [!TYPE] ...)
 *
 * Image embeds are handled before wikilinks because `![[` is a superset
 * of the `[[` pattern.
 *
 * @param content        - Raw markdown content (frontmatter already stripped)
 * @param file           - Source TFile
 * @param app            - Obsidian App instance
 * @param publishedFiles - Map of vault file path to Confluence page title
 * @param spaceKey       - Confluence space key used for cross-page links
 */
export async function preprocessObsidianSyntax(
  content: string,
  file: TFile,
  app: App,
  publishedFiles: Map<string, string>,
  spaceKey: string,
): Promise<PreprocessResult> {
  const images: ImageRef[] = [];

  // ---------------------------------------------------------------
  // 1. Image embeds: ![[image.png]] or ![[image.png|600]]
  // ---------------------------------------------------------------
  const imageEmbedRe =
    /!\[\[([^\]|]+?\.(png|jpe?g|gif|svg|webp))(?:\|([^\]]*))?\]\]/gi;

  content = content.replace(
    imageEmbedRe,
    (match: string, filename: string, _ext: string, sizeOrAlt: string | undefined) => {
      const parsed = sizeOrAlt ? parseInt(sizeOrAlt, 10) : NaN;
      const width: number | null = !isNaN(parsed) ? parsed : null;
      const resolved = app.metadataCache.getFirstLinkpathDest(filename, file.path);
      const resolvedPath = resolved ? resolved.path : null;
      const safeFilename = filenameOnly(filename);

      images.push({
        originalSyntax: match,
        filename: safeFilename,
        resolvedPath,
        width,
      });

      const widthAttr = width !== null ? ` ac:width="${width}"` : '';
      return (
        `<ac:image${widthAttr}>` +
        `<ri:attachment ri:filename="${escapeXml(safeFilename)}"/>` +
        `</ac:image>`
      );
    },
  );

  // ---------------------------------------------------------------
  // 2. Note embeds (non-image): ![[Note Name]]
  // ---------------------------------------------------------------
  const noteEmbedRe = /!\[\[([^\]]+?)\]\]/g;

  content = content.replace(noteEmbedRe, (_match: string, linkPath: string) => {
    // Guard: skip anything that looks like an image (already handled)
    if (IMAGE_EXT_PATTERN.test(linkPath)) {
      return _match;
    }

    const resolved = app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
    if (resolved && publishedFiles.has(resolved.path)) {
      const title = publishedFiles.get(resolved.path)!;
      return (
        `<ac:link>` +
        `<ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(spaceKey)}"/>` +
        `</ac:link>`
      );
    }
    return `<em>(see: ${escapeXml(linkPath)})</em>`;
  });

  // ---------------------------------------------------------------
  // 3. Wikilinks: [[Page Name]] or [[Page Name|alias]]
  // ---------------------------------------------------------------
  const wikilinkRe = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

  content = content.replace(
    wikilinkRe,
    (_match: string, linkPath: string, alias: string | undefined) => {
      const display = alias ?? linkPath;
      const resolved = app.metadataCache.getFirstLinkpathDest(linkPath, file.path);

      if (resolved && publishedFiles.has(resolved.path)) {
        const title = publishedFiles.get(resolved.path)!;
        return (
          `<ac:link>` +
          `<ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(spaceKey)}"/>` +
          `<ac:link-body>${escapeXml(display)}</ac:link-body>` +
          `</ac:link>`
        );
      }
      // Target not published -- degrade to plain text
      return escapeXml(display);
    },
  );

  // ---------------------------------------------------------------
  // 4. Callouts: > [!TYPE] optional title\n> body lines
  // ---------------------------------------------------------------
  const calloutRe = /^> \[!(\w+)\]\s*(.*)?$(?:\r?\n)((?:^>.*$(?:\r?\n|$))*)/gm;

  content = content.replace(
    calloutRe,
    (_match: string, type: string, titleLine: string | undefined, body: string) => {
      const macroName = mapCalloutType(type);
      const title = (titleLine ?? '').trim();
      const bodyContent = stripCalloutPrefix(body);

      const titleParam = title
        ? `<ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>`
        : '';

      return (
        `<ac:structured-macro ac:name="${macroName}">` +
        titleParam +
        `<ac:rich-text-body><p>${escapeXml(bodyContent)}</p></ac:rich-text-body>` +
        `</ac:structured-macro>\n`
      );
    },
  );

  return { content, images };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

/**
 * Map Obsidian callout types to Confluence info/warning/tip/note macros.
 */
function mapCalloutType(type: string): string {
  switch (type.toUpperCase()) {
    case 'NOTE':
    case 'INFO':
      return 'info';
    case 'WARNING':
    case 'CAUTION':
      return 'warning';
    case 'TIP':
    case 'HINT':
      return 'tip';
    case 'IMPORTANT':
      return 'note';
    default:
      return 'info';
  }
}

/**
 * Strip the leading `> ` prefix from each line in a callout body and
 * join them with a single space.
 */
function stripCalloutPrefix(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
}

/**
 * Extract just the filename portion from a possibly nested path
 * (e.g. "Attachments/diagram.png" -> "diagram.png").
 */
function filenameOnly(linkPath: string): string {
  const parts = linkPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Escape XML special characters to produce safe attribute values and text
 * content within Confluence storage format.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
