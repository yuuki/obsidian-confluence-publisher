# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Commands

```bash
npm run dev        # Watch-mode bundle
npm run build      # Production bundle to main.js
npm run typecheck  # TypeScript without emitting files
npm test           # Vitest suite
npm run check      # Typecheck, tests, and production build
```

After building, reload Obsidian (`Ctrl/Cmd+R`) to load the new bundle.

## Product boundary

This is a desktop-only Obsidian plugin for Confluence Server/Data Center REST API v1. It outputs one committed `main.js` bundle and relies on Node.js `http`, `https`, and `crypto`, which are externalized by esbuild. Confluence Cloud and mobile Obsidian are outside scope.

## Architecture

```text
src/main.ts + src/ui/          Commands, destination selection, single-run guard, cancel, progress
             |
             v
src/publisher.ts               Two-stage publication application service
        |              |
        v              v
src/domain/             src/converter/
  publication.ts         obsidian-marked-extension.ts
  settings.ts            storage-renderer.ts
  publication-metadata.ts attachment-name.ts
  publication-planner.ts
  validation.ts
        |              |
        +-------+------+
                v
src/confluence/repository.ts   Confluence pages, ownership properties, attachments
                |
                v
src/confluence/transport.ts    Node HTTP(S), timeout, abort, response validation

src/obsidian/note-repository.ts Vault reads, frontmatter parsing/writes, link resolution
```

### Domain and planning

`src/domain/publication.ts` owns destination snapshots, destination-scoped publication records, page ownership, candidates, plans, and repository ports. `publication-metadata.ts` reads/writes `confluence-publications` and migrates validated legacy keys. `publication-planner.ts` validates every local candidate before remote writes, then resolves pages by verified location and ownership. `settings.ts` migrates persisted settings without sharing or mutating defaults. `validation.ts` enforces Markdown inputs and complete destinations at command boundaries.

A page is plugin-owned only when the Confluence content property `obsidian-confluence-publisher` contains schema version 1, the selected destination ID, and the vault source path. Location and ownership must both match before an update. Legacy frontmatter may claim an unowned page only after its explicit page ID, space, and direct parent are validated. An unowned same-title page is never adopted.

### Converter

`obsidian-marked-extension.ts` recognizes wikilinks, image embeds, note embeds, and callouts as typed `marked` tokens without interpreting code fences or inline code. `storage-renderer.ts` renders that token tree directly to Confluence Storage Format and centralizes XML/attribute escaping and CDATA handling. It also reports unresolved references. `attachment-name.ts` derives collision-resistant attachment names from normalized vault paths and a short SHA-256 hash.

Do not reintroduce a string-placeholder XML preprocessing pipeline. Extend the token types and renderer together, with fixture-style tests for the resulting Storage Format.

### Publisher application service

`src/publisher.ts` coordinates preflight, page resolution, conversion, attachment writes, page updates, and frontmatter writes. Stage one creates any required placeholder pages and immediately records ownership so the complete link map is available. If ownership storage fails, only that newly created placeholder is deleted with a separate five-second cleanup signal. Stage two continues across per-page content failures. A note's publication record is written only after its attachments and page update succeed.

Partial publishes load destination-matching publication records from the vault so links to unselected published notes remain resolvable. Every remote operation receives the active `AbortSignal`; cancellation starts no new normal work, apart from the bounded rollback described above.

### Confluence boundary

`src/confluence/repository.ts` implements REST semantics over an injectable transport: page lookup/create/update/delete, ownership content properties, paginated attachments, create-versus-update upload endpoints, and safe multipart bodies. Existing generated-name attachments are updated on every publish.

`src/confluence/transport.ts` accepts HTTPS and loopback-only HTTP, never follows redirects, applies a 30-second default timeout and `AbortSignal`, limits response size, and validates HTTP status, content type, and JSON. Keep authentication construction outside the transport; diagnostics must not expose credentials.

### Obsidian and UI adapters

`src/obsidian/note-repository.ts` parses YAML, supplies vault-wide destination publication records, resolves Obsidian links, reads image bytes, and writes destination-scoped frontmatter. `src/main.ts` wires the plugin, transport, repository, and Publisher. It allows only one active publish, validates inputs immediately before execution, and scopes the update command to the destination selected first. `src/ui/` contains Markdown-only file selection, destination selection, and terminal progress/cancel state.

## Testing and change rules

- Place behavior tests next to their module as `*.test.ts`; Vitest uses the Obsidian test stub in `src/test/obsidian.ts`.
- Run the narrow test first while iterating, then `npm run check` before completion.
- A production build rewrites the committed `main.js`; verify it matches the source change and is not unexpectedly dirty.
- Keep `package.json`, `package-lock.json`, `manifest.json`, release tags, and release assets version-aligned.
- Update README and this file whenever user-visible behavior or module boundaries change.
