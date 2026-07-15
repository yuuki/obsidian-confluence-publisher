# Ownership Property Error Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有権プロパティ GET の 404 以外の失敗を未所有扱いにしない契約をテストで固定し、パッチ版をリリースする。

**Architecture:** `ConfluenceRepository` の production code は変更せず、transport fake を通じて `getPage` と `findPagesByTitle` の property GET 失敗を検証する。リリース時はすべての配布メタデータを `0.1.1` に同期し、ビルド済み `main.js` をコミットする。

**Tech Stack:** TypeScript、Vitest、npm、GitHub Actions

---

### Task 1: Property GET failure regression tests

**Files:**

- Modify: `src/confluence/repository.test.ts`

- [ ] Write a table-driven test that feeds a successful page response followed by `new TransportError('http', 'property failed', 500)` for both `getPage` and `findPagesByTitle`.
- [ ] Assert that the exact error is rejected and the final request has path `/rest/api/content/p/property/obsidian-confluence-publisher` and the supplied `AbortSignal`.
- [ ] Temporarily mutate the 404-only condition in `fetchOwnership` to treat every `TransportError` as `null`; run `npm test -- src/confluence/repository.test.ts` and confirm the new test fails; revert the temporary mutation.
- [ ] Run `npm test -- src/confluence/repository.test.ts` and commit the test as `test: cover ownership property failures`.

### Task 2: Patch release metadata and artifact

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `manifest.json`
- Modify: `main.js`

- [ ] Set all package and manifest versions to `0.1.1`.
- [ ] Run `npm run build` so committed `main.js` reflects source.
- [ ] Run `RELEASE_TAG=v0.1.1 npm run check` and `git diff --exit-code -- main.js`.
- [ ] Commit the versioned assets as `release: v0.1.1`.
