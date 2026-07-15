# Confluence Publisher for Obsidian

Publish Obsidian notes to **Confluence Server / Data Center** while preserving images, wikilinks, callouts, and task lists.

## Features

- **Safe multi-destination publishing** — Each destination has a stable identity, and every note keeps an independent publication record for each destination.
- **Ownership-aware updates** — Published pages carry an `obsidian-confluence-publisher` content property. A manually created page with the same title is never claimed or overwritten automatically.
- **Wikilink resolution** — Links to notes already published to the selected destination remain Confluence page links even during a single-note publish.
- **Storage Format conversion** — Markdown is parsed as tokens before rendering headings, tables, code, callouts, task lists, wikilinks, and embeds to Confluence Storage Format.
- **Reliable image updates** — Vault paths produce collision-resistant attachment names, and referenced attachments are created or updated on every publish.
- **Preflight validation and recovery** — Invalid destinations, duplicate titles or page IDs, unresolved images, and ownership mismatches stop the publish before remote writes.
- **Cancelable publishing** — A running publish can be canceled, and only the placeholder page whose ownership could not be recorded is rolled back.
- **Two authentication methods** — Personal Access Token (Bearer) or Basic Auth (username/password).

## Requirements

- Obsidian **1.0.0+** on desktop
- Confluence **Server or Data Center** with REST API v1 enabled
- A Personal Access Token or username/password with permission to read, create, update, and delete pages, manage content properties, and upload attachments
- An HTTPS Confluence URL; plain HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1`

Confluence Cloud and Obsidian mobile are not supported.

## Installation

### Using BRAT

[BRAT](https://tfthacker.com/BRAT) installs release builds directly from GitHub. This repository supports BRAT from `v0.1.0`; each compatible GitHub Release must contain `main.js` and `manifest.json` assets.

1. Install and enable **BRAT** from Obsidian's Community plugins.
2. In BRAT settings, choose **Add Beta plugin**.
3. Enter `https://github.com/yuuki/obsidian-confluence-publisher`.
4. Enable **Confluence Publisher** in Obsidian → Settings → Community plugins.
5. Configure the Confluence URL, credentials, and at least one destination.

### Manual installation

Copy `main.js` and `manifest.json` from a GitHub Release into:

```text
<vault>/.obsidian/plugins/confluence-publisher/
```

Then enable **Confluence Publisher** in Obsidian's Community plugins settings.

### Build from source

```bash
npm install
npm run build
```

Copy `main.js` and `manifest.json` into the plugin directory shown above.

## Configuration

Open Obsidian → Settings → Confluence Publisher.

| Setting | Description |
|---|---|
| **Confluence URL** | Base URL of the Server/DC instance, including its context path if applicable. HTTPS is required except for loopback development URLs. |
| **Destinations** | One or more presets containing a label, Space Key, and direct Parent Page ID. Incomplete rows remain editable but cannot be selected for publishing. |
| **Authentication type** | Personal Access Token or Basic Auth. |
| **Strip frontmatter** | Remove YAML frontmatter from published content (enabled by default). |
| **Title source** | Use the frontmatter `title` value when present, or use the note filename. |

To find a Parent Page ID, open the target parent page and locate `pageId=123456` in its URL.

Changing the label of a destination keeps its identity. Changing its space or parent makes existing publication records fail validation; add a new destination when it should represent a different target.

## Usage

The Command Palette provides three commands:

| Command | Description |
|---|---|
| **Publish selected notes to Confluence** | Select Markdown notes from the current note, outgoing links, backlinks, or all notes, then choose a destination. |
| **Publish current note to Confluence** | Publish the active Markdown note to a selected destination. The command is unavailable for non-Markdown files. |
| **Update already published notes** | Choose a destination first, then update only notes recorded for that destination. Notes with validated legacy metadata are also migration candidates. |

Only one publish can run at a time. The progress dialog's **Cancel** action stops new network work and waits for the current request to finish canceling.

### Publication frontmatter

After a successful page update, the note stores a destination-scoped record:

```yaml
confluence-publications:
  550e8400-e29b-41d4-a716-446655440000:
    base-url: https://confluence.example.com
    space-key: DOC
    parent-page-id: "12345"
    page-id: "67890"
    page-url: https://confluence.example.com/pages/viewpage.action?pageId=67890
```

The key under `confluence-publications` is the destination ID managed by the plugin. The record is written only after the page content and all referenced attachments succeed.

Legacy `confluence-page-id` and `confluence-url` fields remain readable. They are migrated only after the page's base URL, space, and direct parent have been validated. A successful migration writes the destination-scoped record and removes the legacy fields.

## Safety model

Before creating or changing pages, the plugin validates all selected notes, titles, page IDs, images, destination snapshots, and existing page ownership. Published pages receive the `obsidian-confluence-publisher` content property containing the schema version, destination ID, and source note path. Existing pages are updated only when their location and ownership match. A human-authored page without that property, including one with the same title, is left untouched and reported as a conflict.

Publishing then runs in two stages:

1. Resolve existing owned pages and create any required placeholder pages. A new page receives its ownership property immediately so links can be resolved safely.
2. Render content, upload each referenced attachment, update the page, and write frontmatter. Failure on one page does not prevent other resolved pages from completing.

If saving ownership on a newly created placeholder fails, the plugin attempts a one-time rollback with an independent five-second timeout, even after cancellation. If both ownership storage and rollback fail, the error reports the orphan page ID and URL for manual recovery. Owned placeholder pages left by another interruption can be recovered on the next publish by matching space, parent, title, destination ID, and source path.

## Images and links

Embedded vault images use deterministic attachment names based on their normalized vault path, basename, and a short SHA-256 hash. This prevents two files with the same basename in different folders from colliding. Duplicate references on one page upload once; an existing attachment with that generated name is updated on every publish so local changes are reflected. Old basename-only attachments are not deleted.

Wikilinks resolve only against publication records for the selected destination. An unpublished linked note is rendered as display text. Note embeds become links to published pages rather than expanded note content. Heading fragments and aliases are preserved.

## Supported Markdown

| Obsidian or Markdown syntax | Confluence result |
|---|---|
| `![[image.png\|600]]` | Attached image with optional width |
| `![[Note Name]]` | Link to an owned published page |
| `[[Page#Heading\|alias]]` | Page link with anchor and display text |
| `> [!NOTE] title` | Confluence info/warning/tip/note macro |
| `# Heading` | `<h1>` through `<h6>` |
| Fenced code | Code macro preserving CDATA content |
| Tables | Confluence table markup |
| `- [x] task` | Confluence native task list |
| `![alt](https://example.com/image.png)` | External image |

## Limitations

- All pages are direct children of the configured parent; note folders do not create a Confluence hierarchy.
- Removing a note does not delete its Confluence page or attachments.
- Old basename-only image attachments are retained.
- Note embeds are links, not transclusions.

## License

[MIT](LICENSE)
