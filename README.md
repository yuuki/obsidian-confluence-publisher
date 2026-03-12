# Confluence Publisher for Obsidian

Publish Obsidian notes to **Confluence Server / Data Center** with full support for images, wikilinks, and callouts.

## Features

- **Image upload** — `![[image.png]]` embeds are uploaded as page attachments and rendered inline
- **Wikilink resolution** — `[[Page Name|alias]]` links between published notes become Confluence cross-page links
- **Callout conversion** — `> [!NOTE]`, `> [!WARNING]`, etc. map to Confluence info/warning/tip/note macros
- **Multiple destinations** — Configure several Space Key + Parent Page ID presets and choose one each time you publish
- **Smart file selection** — The active note is pre-selected; outgoing links and backlinks are surfaced for easy batch publishing
- **Incremental updates** — Already-published notes (tracked via `confluence-page-id` in frontmatter) are updated in place; already-uploaded images are skipped
- **Two authentication methods** — Personal Access Token (Bearer) or Basic Auth (username/password)

## Requirements

- Obsidian **1.0.0+** (desktop only)
- Confluence **Server or Data Center** with REST API v1 enabled
- A Personal Access Token or username/password with page-create and attachment-upload permissions

## Installation

1. Copy the plugin folder into your vault's `.obsidian/plugins/confluence-publisher/` directory
2. Enable **Confluence Publisher** in Obsidian → Settings → Community plugins
3. Configure your Confluence URL, credentials, and at least one destination

### Build from source

```bash
cd .obsidian/plugins/confluence-publisher
npm install
npm run build
```

## Configuration

Open Obsidian → Settings → Confluence Publisher.

| Setting | Description |
|---------|-------------|
| **Confluence URL** | Base URL of your instance (e.g. `https://confluence.example.com`). No trailing slash. |
| **Destinations** | One or more publish targets. Each has a label, Space Key, and Parent Page ID. |
| **Authentication type** | `Personal Access Token` or `Basic Auth`. |
| **Strip frontmatter** | Remove YAML frontmatter from the published page (default: on). |
| **Title source** | Use the frontmatter `title` field or the filename as the Confluence page title. |

### Finding your Parent Page ID

Open the target parent page in Confluence, then look at the URL — it contains `pageId=123456`. Use that number as the Parent Page ID.

## Usage

Three commands are available from the Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---------|-------------|
| **Publish selected notes** | Opens a file picker with sections for the current note, outgoing links, backlinks, and all notes. Select files and publish. |
| **Publish current note** | Publishes the active note directly (skips file picker). |
| **Update already published notes** | Finds all notes with `confluence-page-id` in frontmatter and re-publishes them. |

If you have multiple destinations configured, a destination picker appears before publishing. With a single destination, it is used automatically.

After publishing, two frontmatter fields are added to each note:

```yaml
confluence-page-id: "123456"
confluence-url: "https://confluence.example.com/pages/viewpage.action?pageId=123456"
```

## How It Works

### Two-Pass Publishing

1. **Pass 1 — Page creation**: Each note gets a Confluence page (created or found by title). This builds the mapping needed to resolve wikilinks between notes.
2. **Pass 2 — Content conversion**: Obsidian markdown is converted to Confluence Storage Format, images are uploaded as attachments, and pages are updated with the final content.

### Markdown Conversion

| Obsidian syntax | Confluence result |
|----------------|-------------------|
| `![[image.png\|600]]` | `<ac:image>` with attachment |
| `![[Note Name]]` | Cross-page link (`<ac:link>`) |
| `[[Page\|alias]]` | Cross-page link with display text |
| `> [!NOTE] title` | Info/warning/tip/note macro |
| `# Heading` | `<h1>` – `<h6>` |
| Code blocks | Code macro with language parameter |
| Tables | Confluence table markup |
| `- [x] task` | Confluence native task (`<ac:task>`) |
| `![alt](url)` | External image (`<ri:url>`) |

## Limitations

- **Desktop only** — Uses Node.js `https` module for HTTP requests (not available on Obsidian mobile)
- **Confluence Server/DC only** — Confluence Cloud uses a different API and is not supported
- **Flat hierarchy** — All published pages are created as direct children of the configured parent page (no nested structure)
- **No deletion** — Removing a note does not delete the corresponding Confluence page

## License

MIT
