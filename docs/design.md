# Design of Confluence Publisher for Obsidian

## Purpose

This document explains the architectural decisions behind the plugin, the constraints that shaped them, and the alternatives that were deliberately rejected. It is intended for maintainers and contributors who need to change the implementation without weakening its safety properties.

The plugin publishes notes from a local Obsidian vault to Confluence Server or Data Center through REST API v1. It preserves selected Obsidian and Markdown constructs, uploads local images, maintains links between published notes, and records enough metadata to update the same Confluence pages later.

The central design goal is not merely to make publication succeed. It is to make an incorrect update difficult: the plugin must not silently overwrite a page belonging to another note, another destination, or a human author.

## Scope and constraints

The supported environment is intentionally narrow:

- Obsidian desktop, where Node.js built-in modules are available.
- Confluence Server or Data Center with REST API v1.
- A flat publication hierarchy in which every managed page is a direct child of the configured parent page.
- One committed `main.js` bundle for Obsidian and BRAT distribution.

Confluence Cloud, Obsidian mobile, automatic remote deletion, folder-to-page hierarchy mapping, and note transclusion are outside the current scope. Adding any of them would change core assumptions described below and requires a new design review.

## Architectural overview

```text
src/main.ts and src/ui/
        Commands, destination selection, progress, cancellation
                         |
                         v
src/publisher.ts
        Publication workflow and failure isolation
              |                       |
              v                       v
src/domain/                    src/converter/
        Plans, metadata,              Tokenization, Storage Format,
        ownership, validation         attachment names
              |                       |
              +-----------+-----------+
                          v
src/confluence/repository.ts
        Confluence REST semantics and runtime response validation
                          |
                          v
src/confluence/transport.ts
        HTTP lifecycle, security limits, timeout, and cancellation

src/obsidian/note-repository.ts
        Vault reads, link resolution, image reads, frontmatter writes
```

The layers communicate through typed domain objects and narrow interfaces. The domain does not depend on Obsidian or HTTP. The publisher coordinates interfaces rather than constructing REST requests or editing frontmatter directly.

### Why this structure

Safety checks must be testable without a running Obsidian instance or Confluence server. Separating planning, rendering, REST semantics, and HTTP mechanics makes each boundary independently testable and keeps failure behavior explicit.

### Rejected alternatives

- **A single publisher module containing conversion, HTTP, and frontmatter logic.** This would reduce the number of files, but it would couple unrelated failure modes and make ownership rules difficult to review.
- **A framework-style dependency injection container.** The project needs replaceable ports in tests, but a container would add indirection without improving the small composition root in `src/main.ts`.
- **Domain objects tied directly to Obsidian types.** This would make tests depend on the Obsidian runtime and prevent the planner from remaining a deterministic application boundary.

## Design invariants

The following rules are part of the safety model rather than incidental implementation details:

1. A page may be updated only when both its configured location and ownership property match the selected destination and source note. The sole migration exception is an explicitly identified legacy page whose exact location is verified and whose ownership property is absent; the plugin must claim it before updating content.
2. Destination completeness, duplicate identities, publication snapshots, legacy URLs, image path resolution, and required remote identity checks complete before normal remote writes begin. Resource I/O and changes after preflight remain execution-time failures.
3. A publication record is written to a note only after its attachments and page update succeed.
4. Cancellation starts no new normal work. The only exception is a bounded rollback of a newly created, unowned placeholder.
5. Markdown is parsed into typed tokens before Confluence XML is produced. User text is escaped at the rendering boundary, except for the scanner-approved raw HTML compatibility subset described below.
6. Authentication data must not be forwarded through redirects or exposed in diagnostics.
7. Tests, package metadata, the committed bundle, release tags, and release assets must describe the same build.

Changes that violate an invariant require an explicit replacement design, not a local workaround.

## Destination identity and publication metadata

The settings contain one global Confluence base URL. Each destination has a stable generated ID in addition to its human-readable label, space key, and direct parent page ID. When publication begins, the global base URL and selected destination are combined into a destination snapshot. Notes store publication records under `confluence-publications`, keyed by destination ID. Each record includes that base URL, space, parent, page ID, and page URL.

### Why this choice

A note can be published to multiple Confluence locations. A page ID alone does not describe which configured destination produced it, and a destination label is editable. A stable destination ID gives publication records a durable namespace, while the stored snapshot detects later changes to the destination's location.

Settings migration normalizes malformed persisted values into an editable state. Invalid or whitespace-only destination IDs are generated once and then remain stable. Legacy single-page metadata is readable, but it is migrated only through the explicit page ID after the remote page's base URL, space, and direct parent have been verified.

### Rejected alternatives

- **One global `confluence-page-id` per note.** This cannot represent multiple destinations and can direct an update to the wrong Confluence instance or space.
- **Use the destination label as the key.** Renaming a label would orphan existing records or require a risky bulk metadata migration.
- **Match only by base URL, space, and parent.** Those values are editable and do not distinguish a replacement destination from an intentionally new one.
- **Trust legacy metadata immediately.** Old frontmatter does not contain the complete destination snapshot, so automatic trust could claim a page outside the selected destination.

## Remote ownership

Managed Confluence pages carry the content property `obsidian-confluence-publisher`. Its value contains a schema version, destination ID, and source vault path. A page is considered owned only when the property is well formed and all fields match the current publication candidate.

Location and ownership are checked together. A matching title, matching page ID in destination-scoped metadata, or matching parent alone is not sufficient. Malformed ownership data is an error rather than an absent property.

Legacy metadata has one deliberately narrow adoption path. If its explicit page ID resolves to the selected space and direct parent and the page has no ownership property, the plan marks that existing page to be claimed. Stage one stores the ownership property before any content update. A same-title search result is never claimed through this path because a title does not provide the explicit identity carried by legacy metadata. If storing ownership fails, publication stops without deleting the pre-existing page; rollback deletion applies only to a placeholder created by the current run.

### Why this choice

Confluence titles are not identities, local metadata can become stale, and pages can be moved or manually replaced. A server-side ownership marker lets the plugin prove that a remote page was assigned to the same destination and note. Versioning the property leaves room for an explicit future migration instead of silently reinterpreting new shapes. The legacy exception transfers a page identified by old metadata into this stronger model only after its location and lack of conflicting ownership are verified.

### Rejected alternatives

- **Adopt any page with the same title.** This can overwrite a human-authored page and makes title collisions destructive.
- **Trust local page IDs without checking the server.** A page may have moved, been deleted and recreated, or belong to a different source.
- **Store ownership only in local frontmatter.** Local metadata cannot establish who owns the current remote object.
- **Treat malformed or future ownership schemas as unowned.** Doing so could turn data corruption or an unsupported schema into permission to claim the page.
- **Claim a same-title page while migrating legacy metadata.** A title can identify a human-authored or unrelated page; legacy adoption requires the explicit stored page ID.

## Preflight planning

The command and Publisher boundaries reject non-Markdown files before planning. `buildPublicationPlan` then separates publication planning from execution. It validates local candidates, including destination completeness, duplicate titles, duplicate page IDs, unresolved image paths, publication snapshots, and legacy URLs. It then resolves saved or same-title remote pages and verifies their exact location and ownership. Preflight does not read image bytes; a binary read failure or a vault change after planning becomes a page-specific failure during stage two.

The planner returns either a complete coherent plan or a collection of issues. Consumers treat a successful plan as the input to execution; the returned JavaScript objects are not frozen or runtime-immutable. The planner does not create, update, or delete pages.

### Why this choice

Batch publication should not perform some writes and only then discover a predictable conflict in another note. A distinct plan makes the write boundary visible and ensures that normal execution begins with a coherent set of page identities.

### Rejected alternatives

- **Validate each note immediately before writing it.** This is simpler for a single note but produces avoidable partial batches when a later note has a duplicate or unresolved image.
- **Resolve pages by title during rendering.** Rendering should be deterministic and should not make network decisions or choose page identity.
- **Automatically choose the first same-title result.** Search order is not an ownership guarantee; ambiguous results must stop publication.

## Two-stage publication

Publication runs in two stages after preflight:

1. Resolve all update targets and create required placeholder pages. A new placeholder receives its ownership property immediately.
2. Build the complete link map, render each note, upload referenced attachments, update page content, and finally write publication frontmatter.

Selected notes use their planned titles. Links to unselected but previously published notes use the title currently returned by a remotely verified owned page. This prevents a local rename from generating a link to a title that has not yet been published.

### Why this choice

Confluence links are title based. Every selected note needs a remote page identity before any note can be rendered with reliable links to the others. Creating owned placeholders first breaks this dependency cycle without publishing incomplete note content as a successful result.

The second stage isolates content failures per page. Once identities are safely established, one failed attachment or conversion should not discard successful work for unrelated pages.

### Rejected alternatives

- **Render and publish one note completely before starting the next.** Forward links to pages not yet created cannot be resolved reliably.
- **Render all notes before creating pages.** Rendering lacks the complete remote title and identity map.
- **Use local titles for every previously published note.** A locally renamed but unrepublished note may still have its old Confluence title.
- **Roll back an entire batch after any content failure.** Confluence operations are not transactional, and compensating updates could destroy valid concurrent edits.

## Cancellation, rollback, and partial failure

One active-run `AbortSignal` flows from the UI through the publisher and repository to every normal HTTP request. Cancellation prevents new normal operations and destroys the active request. The only request that does not use this signal is the rollback DELETE described below, which has its own five-second cleanup signal. Cancellation does not attempt broad compensation for already completed page or attachment updates.

There is one narrow rollback rule: if a new placeholder page is created but storing its ownership property fails, the plugin attempts to delete that page with an independent five-second cleanup signal. If cleanup also fails, the error reports the orphan page ID and URL for manual recovery.

A failed event records a page or phase failure but does not by itself terminate progress; later pages may continue and a final complete event records the aggregate result. Once progress is complete or canceled, late events do not overwrite that terminal state.

### Why this choice

Without the ownership property, a placeholder cannot be safely recovered as plugin-owned. Deleting only that newly created page is a bounded and justified compensation. In contrast, rolling back successfully updated pages or attachments would require reconstructing remote history and could overwrite changes made by another user.

### Rejected alternatives

- **Use cancellation only in the UI.** Hiding a modal does not stop network writes and gives a false cancellation guarantee.
- **Reuse the canceled signal for cleanup.** Cleanup would be aborted immediately and leave predictable orphan pages.
- **Retry non-idempotent writes automatically.** Retrying page creation or attachment operations can create duplicates after an uncertain network failure.
- **Attempt all-or-nothing batch rollback.** Confluence provides no transaction spanning pages, properties, and attachments.

## Markdown parsing and Confluence Storage Format

Obsidian syntax is recognized through a `marked` extension that emits typed tokens for wikilinks, image embeds, note embeds, and callouts. The storage renderer walks the token tree and produces Confluence Storage Format. XML text, attributes, and CDATA-sensitive content are escaped centrally.

Code fences and inline code remain opaque to Obsidian syntax recognition. Unresolved note links render as display text. Note embeds become links rather than transcluded content.

Conversion runs twice for selected notes. Candidate preparation parses the note with an empty page-title map to collect image references and reject unresolved local images before remote writes. Stage two parses the note again after page identities and link titles are known; link resolution runs again, and the resulting image information drives attachment uploads and rendering. Unresolved images remain a failure in stage two because the vault may change between preflight and execution.

Raw HTML has a limited compatibility path. The renderer passes through only fragments that its XML scanner accepts as well formed and safe: element names cannot be namespaced, attributes must be quoted and non-duplicated, attribute and character data must contain only accepted XML characters and entities, and nesting must balance. Unsafe fragments are escaped as text.

### Why this choice

Markdown and Confluence Storage Format have different grammars. A typed intermediate representation preserves context: syntax inside code is not treated as a link, block macros are not accidentally wrapped as paragraphs, and escaping occurs at the point where XML is generated. The two conversion passes intentionally separate early resource validation from final link-aware rendering. Limited raw HTML pass-through preserves common Markdown compatibility without accepting arbitrary Confluence XML or namespaced macros from note content.

### Rejected alternatives

- **String replacement before or after Markdown rendering.** Placeholder strings can collide with user content, lose block context, or be escaped asymmetrically by the Markdown parser.
- **Pass arbitrary raw HTML or Confluence XML through unchanged.** This would make Storage Format validity and injection safety depend on untrusted note content. Only scanner-approved, non-namespaced XML fragments bypass escaping.
- **Reuse the preflight conversion result in stage two.** Its empty page-title map cannot render final cross-note links, and its resolved image paths may be stale after vault changes.
- **Expand note embeds recursively.** Transclusion introduces cycles, ordering questions, duplicated attachment ownership, and unclear source attribution.
- **Maintain a custom full Markdown parser.** Extending `marked` provides token context without reimplementing the Markdown grammar.

## Attachment identity and updates

Local image attachments receive deterministic names derived from the normalized vault path, basename, and a short SHA-256 hash. Duplicate references on one page upload once. An existing generated-name attachment is updated on every publish, and the repository caches attachment listings only for the duration of its instance.

Multipart bodies are assembled as bytes. Filenames and MIME types reject control characters, header-sensitive characters are escaped, and the boundary is changed if it appears in file content.

### Why this choice

Basenames are not unique in a vault. Including a path-derived hash avoids collisions while keeping names recognizable. Updating existing attachments ensures that changed local files are reflected remotely. A per-run cache avoids repeated paginated listings without persisting stale remote state.

### Rejected alternatives

- **Use only the basename.** `images/logo.png` and `archive/logo.png` would target the same attachment.
- **Skip an attachment when the name already exists.** Local edits would never be published.
- **Use a global persistent attachment cache.** It would become stale when Confluence changes outside the plugin.
- **Delete old attachments automatically.** The plugin cannot always distinguish obsolete managed files from attachments retained intentionally by users.

## HTTP transport

The transport uses Node.js `http` and `https` directly. HTTPS is required except for explicit loopback hosts. The configured Confluence context path is preserved, path escape and encoded path separators are rejected, redirects are not followed, and authentication construction remains outside the transport.

Every request has a timeout and an `AbortSignal`. Responses have a bounded buffered size. JSON operations validate status, media type, and JSON syntax; bodyless operations use a separate method. Typed transport errors distinguish URL, timeout, abort, network, redirect, HTTP status, content type, response size, and JSON failures. Error response body diagnostics are limited to 300 characters. Error bodies and redirect locations are sanitized using the supplied credentials before they are reported.

### Why this choice

Authenticated Confluence requests require control over redirect behavior, request destruction, response events, binary bodies, and error sanitization. Direct Node APIs expose those controls and match the desktop-only product boundary.

### Rejected alternatives

- **Obsidian `requestUrl` or a high-level fetch wrapper.** A higher-level client can conceal redirect and connection behavior. Following a login or cross-origin redirect risks forwarding credentials or accepting HTML as an API response.
- **Allow arbitrary plain HTTP.** Credentials would be exposed in transit. Loopback HTTP remains available for local development and tests.
- **Buffer responses without a limit.** A malformed or hostile server could exhaust the plugin process memory.
- **Return raw responses to repository methods.** Status, content-type, timeout, and sanitization rules would be duplicated and become inconsistent.
- **Stream JSON responses.** The expected REST payloads are small enough that bounded buffering is simpler and easier to validate.

## Confluence repository

The repository maps domain operations to REST API v1. It validates API data at runtime because TypeScript types do not constrain server responses. Page reads include version, ancestors, space, and ownership in one expanded response. Only a typed page-read 404 becomes `null`; authentication, timeout, and server errors propagate.

Updates use Confluence's optimistic version contract. Pagination follows server-provided next links with cycle detection. Attachment creation and attachment data updates use their distinct endpoints, and upload parsing accepts the response shapes observed across supported Server and Data Center versions.

### Why this choice

Keeping Confluence semantics above transport mechanics avoids duplicating HTTP lifecycle code while preserving a service-specific place for response validation, pagination, ownership properties, and attachment rules.

### Rejected alternatives

- **Put REST paths and response shapes in the transport.** This would make the transport Confluence-specific and harder to test as a security boundary.
- **Trust response casts.** Server versions, proxies, and error pages can return shapes that TypeScript cannot verify at runtime.
- **Use a large fixed pagination limit.** It can silently omit results and still depends on undocumented server caps.
- **Refetch attachments before every upload.** This adds a paginated round trip per image without improving consistency within one publication run.
- **Add automatic repository retries.** Several operations are not safely idempotent after an uncertain response.

## Obsidian and UI boundaries

The note repository owns YAML parsing, destination-scoped frontmatter changes, vault link resolution, and image reads. UI adapters select only Markdown files, require a complete destination, expose progress and cancellation, and enforce a single active publication run.

### Why this choice

Obsidian APIs are environment-specific and difficult to use in pure domain tests. Keeping them behind an adapter allows the planner, converter, and publisher to be tested with small fakes. A single-run guard prevents two commands from concurrently changing the same local metadata and remote pages.

### Rejected alternatives

- **Let domain code read `TFile` or mutate frontmatter.** This couples safety rules to the Obsidian runtime and obscures when local state is committed.
- **Allow concurrent publication runs.** Shared destination records, page versions, and progress UI would race without a much larger coordination design.
- **Write frontmatter as soon as a page is created.** A placeholder or failed attachment upload would be recorded as a successful publication.

## Testing and release strategy

Behavior tests live next to their modules and use Vitest. The Obsidian adapter uses a focused test stub. Transport tests use loopback servers to exercise real Node request lifecycle behavior without an external Confluence dependency. Repository and publisher tests use narrow fakes so ownership, planning, cancellation, and partial failures can be reproduced deterministically.

`npm run check` runs type checking, the complete test suite, version verification, and a production build. CI repeats that command and verifies that the committed `main.js` matches the source. Release automation runs only for `v*` tags, verifies that the package, manifest, and tag versions agree, and publishes `main.js` and `manifest.json` as release assets.

### Why this choice

The committed bundle is part of the distributed product, so source-only verification is insufficient. Pure and loopback tests cover most safety behavior quickly, while keeping CI independent of credentials and Confluence availability.

### Rejected alternatives

- **Only test manually in Obsidian.** Manual testing cannot reliably cover cancellation races, malformed responses, ownership conflicts, or migration edge cases.
- **Run CI against a shared Confluence instance.** Credentials, availability, server state, and cleanup would make tests slow and nondeterministic.
- **Build assets only during release.** BRAT and repository consumers expect the committed bundle to remain reviewable and synchronized with source.
- **Derive release versions from a pull request ref.** Pull request refs such as `1/merge` are not release tags; only the release workflow supplies the explicit tag to version verification.

## Guidance for future changes

When adding a feature, first identify which invariant it affects. Extend the narrowest responsible layer and add a behavior test at that boundary. In particular:

- New Obsidian syntax should add or extend typed tokens and renderer behavior together.
- New remote update paths must prove location and ownership before writing.
- New network operations must carry the active `AbortSignal`, use the transport limits, and avoid implicit retries of non-idempotent work.
- New metadata schemas must be versioned and migrated explicitly.
- New release artifacts must be verified against the same version and source commit.

If a change requires weakening an invariant, document the replacement guarantee and its rejected alternatives before implementation.
