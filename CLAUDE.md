# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build          # Production build (esbuild → main.js)
npm run dev            # Watch mode for development
```

After building, reload Obsidian (Ctrl+R) to pick up changes.

## Architecture

Obsidian plugin (desktop-only, Electron) that publishes markdown notes to Confluence Server/Data Center via REST API v1. Output is a single `main.js` bundle.

### Module Layers

```
main.ts                    Plugin entry, 3 commands (publish-selected, publish-current, update-published)
  ├── settings.ts          Settings UI, ConfluenceDestination[], migration from legacy schema
  ├── ui/                  Modals (file-select, destination-select, progress)
  ├── publisher.ts         2-pass publish engine (pass 1: create pages, pass 2: convert & upload)
  ├── converter/
  │   ├── obsidian-syntax.ts    Obsidian → Confluence XML (images, wikilinks, callouts)
  │   └── markdown-to-storage.ts  Markdown → Confluence Storage Format via marked
  └── confluence/
      ├── client.ts        REST API client using Node.js https (NOT Obsidian's requestUrl)
      └── types.ts         API response types, ImageRef, ProgressEvent
```

### Key Design Decisions

**Node.js `https` instead of `requestUrl`**: Obsidian's `requestUrl` follows HTTP redirects and strips the `Authorization` header, causing Confluence to return HTML login pages. The client uses Node.js `https` directly to match curl behavior (no auto-redirect). The `https` and `http` modules are marked as externals in esbuild.

**Placeholder strategy for Confluence XML**: `marked` does not recognise `ac:*` namespaced tags. Opening tags get escaped (`&lt;ac:image&gt;`) but closing tags (`</ac:image>`) pass through — producing broken XHTML. The converter extracts all `<ac:*>` snippets into text placeholders before `marked`, then restores them after, unwrapping block-level macros from `<p>` tags.

**2-pass publish**: Pass 1 creates/finds all pages to build a file-path → Confluence-title mapping. Pass 2 uses that mapping to resolve wikilinks, then converts content, uploads images (skipping already-uploaded), and updates pages.

**Frontmatter round-trip**: After publishing, `confluence-page-id` and `confluence-url` are written back to the note's YAML frontmatter, making subsequent publishes into updates.

### Processing Pipeline

```
![[image.png]]  →  <ac:image><ri:attachment .../>  (obsidian-syntax.ts)
[[Page|alias]]  →  <ac:link><ri:page .../>          (obsidian-syntax.ts)
> [!NOTE] ...   →  <ac:structured-macro ac:name="info">  (obsidian-syntax.ts)
                →  placeholders → marked → restore  (markdown-to-storage.ts)
```

### Settings Schema

- `destinations: ConfluenceDestination[]` — multiple space/parent-page presets, selectable per publish
- `authType: 'pat' | 'basic'` — Personal Access Token (Bearer) or username/password
- `titleSource: 'frontmatter' | 'filename'` — page title from YAML `title` field or filename
- Legacy `spaceKey`/`parentPageId` at top level auto-migrated to `destinations[0]`

## Conventions

- No test suite; verify by building and testing in Obsidian
- `isDesktopOnly: true` — relies on Node.js built-in modules (`https`, `http`)
- All API types in `confluence/types.ts`; ProgressEvent is a discriminated union
- Image upload checks existing attachments via `getAttachmentFilenames()` to skip duplicates
