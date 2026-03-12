import { Marked, Renderer } from 'marked';
import type { Tokens } from 'marked';

/**
 * Convert standard Markdown to Confluence Storage Format (XHTML).
 *
 * Assumes Obsidian-specific syntax (wikilinks, image embeds, callouts) has
 * already been pre-processed by `preprocessObsidianSyntax` into inline
 * Confluence XML fragments (ac:*, ri:*).
 *
 * `marked` does NOT recognise `ac:*` / `ri:*` namespaced tags as HTML.
 * Opening tags like `<ac:image>` are escaped to `&lt;ac:image&gt;` while
 * closing tags like `</ac:image>` happen to match the inline-HTML closing-
 * tag regex and are passed through verbatim — producing broken XHTML.
 *
 * To work around this, we extract all Confluence XML snippets from the
 * input, replace them with safe text placeholders, run `marked`, and then
 * restore the original XML — unwrapping block-level macros from `<p>` tags
 * where necessary.
 */
export function markdownToStorageFormat(markdown: string): string {
  // ------------------------------------------------------------------
  // Step 1 — Shelter Confluence XML from marked's tokeniser
  // ------------------------------------------------------------------
  const placeholders = new Map<string, string>();
  let phId = 0;

  // Match self-contained ac:* blocks produced by the Obsidian preprocessor.
  // Handles <ac:image>, <ac:link>, <ac:structured-macro> (non-nested same-type).
  const cfXmlRe =
    /<ac:(image|structured-macro|link)\b[\s\S]*?<\/ac:\1>/g;

  const prepared = markdown.replace(cfXmlRe, (match) => {
    const key = `CFXMLPH${phId++}ENDPH`;
    placeholders.set(key, match);
    return key;
  });

  // ------------------------------------------------------------------
  // Step 2 — Set up marked renderer
  // ------------------------------------------------------------------
  const renderer = new Renderer();

  // Block-level renderers -----------------------------------------------

  renderer.heading = function (this: Renderer, { tokens, depth }: Tokens.Heading): string {
    const text = this.parser.parseInline(tokens);
    return `<h${depth}>${text}</h${depth}>\n`;
  };

  renderer.code = function (_token: Tokens.Code): string {
    const { text, lang } = _token;
    const langParam = lang
      ? `<ac:parameter ac:name="language">${escapeXml(lang)}</ac:parameter>`
      : '';
    return (
      `<ac:structured-macro ac:name="code">` +
      langParam +
      `<ac:plain-text-body><![CDATA[${text.replace(/]]>/g, ']]]]><![CDATA[>')}]]></ac:plain-text-body>` +
      `</ac:structured-macro>\n`
    );
  };

  renderer.blockquote = function (this: Renderer, { tokens }: Tokens.Blockquote): string {
    const body = this.parser.parse(tokens);
    return `<blockquote>${body}</blockquote>\n`;
  };

  renderer.hr = function (_token: Tokens.Hr): string {
    return `<hr/>\n`;
  };

  renderer.list = function (this: Renderer, token: Tokens.List): string {
    const tag = token.ordered ? 'ol' : 'ul';
    let body = '';
    for (const item of token.items) {
      body += this.listitem(item);
    }
    return `<${tag}>\n${body}</${tag}>\n`;
  };

  renderer.listitem = function (this: Renderer, item: Tokens.ListItem): string {
    let itemBody = '';

    if (item.task) {
      const checkbox = item.checked
        ? '<ac:task-status>complete</ac:task-status>'
        : '<ac:task-status>incomplete</ac:task-status>';
      const innerText = this.parser.parse(item.tokens);
      itemBody = `<ac:task>${checkbox}<ac:task-body>${innerText}</ac:task-body></ac:task>`;
    } else {
      itemBody = this.parser.parse(item.tokens);
    }

    return `<li>${itemBody}</li>\n`;
  };

  renderer.paragraph = function (this: Renderer, { tokens }: Tokens.Paragraph): string {
    const text = this.parser.parseInline(tokens);
    return `<p>${text}</p>\n`;
  };

  renderer.table = function (this: Renderer, token: Tokens.Table): string {
    let headerRow = '<tr>\n';
    for (const cell of token.header) {
      const content = this.parser.parseInline(cell.tokens);
      headerRow += `<th>${content}</th>\n`;
    }
    headerRow += '</tr>\n';

    let bodyRows = '';
    for (const row of token.rows) {
      bodyRows += '<tr>\n';
      for (const cell of row) {
        const content = this.parser.parseInline(cell.tokens);
        bodyRows += `<td>${content}</td>\n`;
      }
      bodyRows += '</tr>\n';
    }

    return `<table><tbody>\n${headerRow}${bodyRows}</tbody></table>\n`;
  };

  renderer.html = function ({ text }: Tokens.HTML | Tokens.Tag): string {
    return text;
  };

  // Inline-level renderers ----------------------------------------------

  renderer.strong = function (this: Renderer, { tokens }: Tokens.Strong): string {
    const text = this.parser.parseInline(tokens);
    return `<strong>${text}</strong>`;
  };

  renderer.em = function (this: Renderer, { tokens }: Tokens.Em): string {
    const text = this.parser.parseInline(tokens);
    return `<em>${text}</em>`;
  };

  renderer.codespan = function ({ text }: Tokens.Codespan): string {
    return `<code>${text}</code>`;
  };

  renderer.br = function (_token: Tokens.Br): string {
    return `<br/>`;
  };

  renderer.del = function (this: Renderer, { tokens }: Tokens.Del): string {
    const text = this.parser.parseInline(tokens);
    return `<del>${text}</del>`;
  };

  renderer.link = function (this: Renderer, { href, title, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeXml(title)}"` : '';
    return `<a href="${escapeXml(href)}"${titleAttr}>${text}</a>`;
  };

  renderer.image = function ({ href, title, text }: Tokens.Image): string {
    // External images (standard markdown ![alt](url)).
    // Use a placeholder so the <ac:image> doesn't get mangled by marked.
    const altAttr = (text || title)
      ? ` ac:alt="${escapeXml(text || title || '')}"`
      : '';
    const xml =
      `<ac:image${altAttr}>` +
      `<ri:url ri:value="${escapeXml(href)}"/>` +
      `</ac:image>`;
    const key = `CFXMLPH${phId++}ENDPH`;
    placeholders.set(key, xml);
    return key;
  };

  renderer.text = function (token: Tokens.Text | Tokens.Escape | Tokens.Tag): string {
    if ('tokens' in token && token.tokens && token.tokens.length > 0) {
      return this.parser.parseInline(token.tokens);
    }
    return token.text;
  };

  renderer.space = function (_token: Tokens.Space): string {
    return '';
  };

  // ------------------------------------------------------------------
  // Step 3 — Run marked
  // ------------------------------------------------------------------
  const marked = new Marked({ renderer });
  let result = marked.parse(prepared) as string;

  // ------------------------------------------------------------------
  // Step 4 — Restore Confluence XML from placeholders
  // ------------------------------------------------------------------
  // Block-level macros (image, structured-macro) must be outside <p>.
  // Inline macros (link) stay inside <p>.
  const blockTags = new Set(['image', 'structured-macro']);

  for (const [key, xml] of placeholders) {
    // Determine if this is a block-level macro
    const tagMatch = xml.match(/^<ac:(\w[\w-]*)/);
    const isBlock = tagMatch ? blockTags.has(tagMatch[1]) : false;

    if (isBlock) {
      // If placeholder is sole content in <p>, unwrap the <p>
      result = result.replace(
        new RegExp(`<p>\\s*${key}\\s*</p>`),
        xml + '\n',
      );
    }
    // Replace any remaining occurrences (inline or not yet replaced)
    result = result.replace(new RegExp(key, 'g'), xml);
  }

  return result;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
