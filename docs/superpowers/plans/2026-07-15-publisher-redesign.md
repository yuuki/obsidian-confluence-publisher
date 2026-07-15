# Obsidian Confluence Publisher Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開先の誤更新、Markdown変換の内容破壊、添付更新の欠落、通信停止、UI入力不備を、型付きの公開計画とMarkdown token treeを中心とする実装へ置き換えて解消する。

**Architecture:** コマンドとUI、application service、publication planner、Markdown converter、Confluence repository、Node.js transportを分離する。外部書き込み前に公開計画を検証し、ページ作成後にリンク対応表を確定してから添付と本文を更新する。

**Tech Stack:** TypeScript、Obsidian API、marked extension API、Node.js `https` / `http` / `crypto`、Vitest、esbuild、GitHub Actions

---

## 実装上の共通規則

- 作業場所は`/Users/y-tsubouchi/src/github.com/yuuki/obsidian-confluence-publisher/.worktrees/full-redesign`とする。
- 設計基準は`docs/superpowers/specs/2026-07-15-publisher-redesign-design.md`とする。
- production codeを書く前に、対象の回帰テストが期待した理由で失敗することを確認する。
- 各Taskのcommit前に、対象test、`npm test`、`npm run typecheck`を実行する。
- 各Topicの最後にセルフレビューを行い、別subagentへレビューを委譲する。
- reviewerが`ACCEPT`を返すまで、指摘を一項目ずつ修正して同じreviewerへ再依頼する。
- reviewerは実装を変更しない。実装担当が修正する。
- コメントは実装方法ではなく、採用しなかった挙動または安全上の理由を書く。

## 仕様対応表

- destination別metadata、旧形式移行、設定配列の非共有化：Task 2
- titleとpage IDの重複、stale ID、spaceとparent検証、所有権照合：Task 3
- code内構文の保護、callout境界、aliasとheading分解：Task 5
- task list、callout本文、anchor、画像参照、placeholder廃止：Task 6
- HTTPS制約、timeout、abort、response中断、redirect：Task 8
- 添付pagination、basename衝突、既存添付更新、multipart安全性：Task 9
- 二段階公開、partial link map、画像失敗伝播、frontmatter順序、strip設定：Task 11
- Markdown限定、空destination、二重実行、進捗整合、cancel：Task 12
- README、CLAUDE.md、MIT license、BRAT説明：Task 14
- test、型検査、bundle一致、CI、version一致、Release assets：Task 15
- Topic別accept、統合accept：Task 4、7、10、13、16
- PR、CI成功後のsquash merge、`v0.1.0` Release確認：Task 17

## Topic 1: publication metadataと公開計画

### Task 1: テスト基盤とdomain model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/domain/publication.ts`
- Create: `src/domain/publication.test.ts`

- [ ] **Step 1: test scriptsとVitestを追加する**

`package.json`のscriptsとdevDependenciesを次の形へ変更する。

```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "npm run typecheck && npm test && npm run build"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.28.1",
    "obsidian": "^1.7.2",
    "typescript": "^5.5.0",
    "vitest": "^3.2.4"
  }
}
```

`marked`はruntime dependencyだけに置き、devDependenciesから重複を削除する。

Run: `npm install`

Expected: `package-lock.json`が更新され、`npm audit --omit=dev`が0 vulnerabilitiesを返す。

- [ ] **Step 2: Vitest設定を追加する**

`vitest.config.ts`を作成する。

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

`tsconfig.json`の`include`を`["src/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs", "vitest.config.ts"]`へ変更し、`types`へ`node`を追加する。

- [ ] **Step 3: domain modelの失敗するtestを書く**

`src/domain/publication.test.ts`へ次を追加する。

```ts
import { describe, expect, it } from 'vitest';
import { destinationSnapshot, isSameDestination } from './publication';

describe('destinationSnapshot', () => {
  it('normalizes the base URL and copies the destination identity', () => {
    const snapshot = destinationSnapshot('https://example.test/confluence/', {
      id: 'dest-1',
      label: 'Docs',
      spaceKey: 'DOC',
      parentPageId: '42',
    });

    expect(snapshot).toEqual({
      destinationId: 'dest-1',
      baseUrl: 'https://example.test/confluence',
      spaceKey: 'DOC',
      parentPageId: '42',
    });
    expect(isSameDestination(snapshot, { ...snapshot, parentPageId: '99' })).toBe(false);
  });
});
```

- [ ] **Step 4: testが未実装で失敗することを確認する**

Run: `npm test -- src/domain/publication.test.ts`

Expected: FAIL。`./publication`またはexportが存在しないと表示される。

- [ ] **Step 5: domain modelを実装する**

`src/domain/publication.ts`へ次の型と関数を追加する。

```ts
export interface Destination {
  id: string;
  label: string;
  spaceKey: string;
  parentPageId: string;
}

export interface DestinationSnapshot {
  destinationId: string;
  baseUrl: string;
  spaceKey: string;
  parentPageId: string;
}

export interface PublicationRecord extends DestinationSnapshot {
  pageId: string;
  pageUrl: string;
}

export interface LegacyPublication {
  pageId: string;
  pageUrl: string | null;
}

export interface NoteInput {
  path: string;
  basename: string;
  raw: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface ResolvedPage {
  id: string;
  title: string;
  spaceKey: string;
  parentPageId: string | null;
  version: number;
  webui: string | null;
  ownership: PageOwnership | null;
}

export const PAGE_OWNERSHIP_PROPERTY = 'obsidian-confluence-publisher';

export interface PageOwnership {
  schemaVersion: 1;
  destinationId: string;
  sourcePath: string;
}

export interface EmbeddedImage {
  sourcePath: string;
  resolvedPath: string;
  attachmentName: string;
  width: number | null;
}

export type PlanIssueCode =
  | 'invalid-file'
  | 'invalid-destination'
  | 'invalid-frontmatter'
  | 'duplicate-title'
  | 'duplicate-page-id'
  | 'unresolved-image'
  | 'destination-mismatch'
  | 'ambiguous-page';

export interface PlanIssue {
  code: PlanIssueCode;
  path: string | null;
  message: string;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function destinationSnapshot(baseUrl: string, destination: Destination): DestinationSnapshot {
  return {
    destinationId: destination.id,
    baseUrl: normalizeBaseUrl(baseUrl),
    spaceKey: destination.spaceKey.trim(),
    parentPageId: destination.parentPageId.trim(),
  };
}

export function isSameDestination(left: DestinationSnapshot, right: DestinationSnapshot): boolean {
  return left.destinationId === right.destinationId
    && normalizeBaseUrl(left.baseUrl) === normalizeBaseUrl(right.baseUrl)
    && left.spaceKey === right.spaceKey
    && left.parentPageId === right.parentPageId;
}
```

- [ ] **Step 6: test、型検査、baseline buildを確認する**

Run: `npm test -- src/domain/publication.test.ts && npm run typecheck && npm run build`

Expected: 1 test passed。型エラーなし。`main.js`生成成功。

- [ ] **Step 7: Task 1をcommitする**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/domain/publication.ts src/domain/publication.test.ts main.js
git commit -m "test: add publisher domain test harness"
```

### Task 2: settingsとfrontmatter metadataの移行

**Files:**
- Create: `src/domain/settings.ts`
- Create: `src/domain/settings.test.ts`
- Create: `src/domain/publication-metadata.ts`
- Create: `src/domain/publication-metadata.test.ts`
- Modify: `src/settings.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: settings migrationの失敗するtestを書く**

`src/domain/settings.test.ts`へ次を追加する。

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings } from './settings';

describe('migrateSettings', () => {
  it('creates stable destination ids without mutating defaults', () => {
    const legacy = { spaceKey: 'DOC', parentPageId: '42' };
    const first = migrateSettings(legacy, () => 'dest-generated');
    const second = migrateSettings(first.settings, () => 'must-not-run');

    expect(first.changed).toBe(true);
    expect(first.settings.destinations[0]).toMatchObject({
      id: 'dest-generated', spaceKey: 'DOC', parentPageId: '42',
    });
    expect(second.changed).toBe(false);
    expect(second.settings.destinations[0].id).toBe('dest-generated');
    expect(DEFAULT_SETTINGS.destinations).toEqual([]);
  });
});
```

- [ ] **Step 2: metadataの失敗するtestを書く**

`src/domain/publication-metadata.test.ts`へ次を追加する。

```ts
import { describe, expect, it } from 'vitest';
import { readLegacyPublication, readPublication, writePublication } from './publication-metadata';

const record = {
  destinationId: 'dest-1',
  baseUrl: 'https://example.test',
  spaceKey: 'DOC',
  parentPageId: '42',
  pageId: '99',
  pageUrl: 'https://example.test/pages/viewpage.action?pageId=99',
};

describe('publication metadata', () => {
  it('writes a destination record and removes legacy keys only in the returned copy', () => {
    const original = {
      title: 'Example',
      'confluence-page-id': 'old',
      'confluence-url': 'https://example.test/old',
    };
    const next = writePublication(original, record);

    expect(readPublication(next, 'dest-1')).toEqual(record);
    expect(readLegacyPublication(next)).toBeNull();
    expect(original['confluence-page-id']).toBe('old');
  });
});
```

- [ ] **Step 3: 両testが未実装で失敗することを確認する**

Run: `npm test -- src/domain/settings.test.ts src/domain/publication-metadata.test.ts`

Expected: FAIL。対象moduleまたはexportが存在しない。

- [ ] **Step 4: pure settings modelを実装する**

`src/domain/settings.ts`に、既存設定fieldと次のmigration APIを移す。

```ts
import type { Destination } from './publication';

export interface ConfluencePublisherSettings {
  confluenceUrl: string;
  destinations: Destination[];
  authType: 'pat' | 'basic';
  token: string;
  username: string;
  password: string;
  stripFrontmatter: boolean;
  titleSource: 'frontmatter' | 'filename';
}

export const DEFAULT_SETTINGS: ConfluencePublisherSettings = {
  confluenceUrl: '',
  destinations: [],
  authType: 'pat',
  token: '',
  username: '',
  password: '',
  stripFrontmatter: true,
  titleSource: 'frontmatter',
};

export interface MigrationResult {
  settings: ConfluencePublisherSettings;
  changed: boolean;
}

export function migrateSettings(
  data: Record<string, unknown>,
  createId: () => string,
): MigrationResult {
  const source = data as Partial<ConfluencePublisherSettings> & {
    spaceKey?: unknown;
    parentPageId?: unknown;
  };
  let changed = false;
  let destinations = Array.isArray(source.destinations)
    ? source.destinations.map((destination) => ({ ...destination }))
    : [];
  if (!Array.isArray(source.destinations)) changed = true;
  if (
    destinations.length === 0
    && typeof source.spaceKey === 'string'
    && typeof source.parentPageId === 'string'
  ) {
    destinations = [{
      id: createId(),
      label: source.spaceKey,
      spaceKey: source.spaceKey,
      parentPageId: source.parentPageId,
    }];
    changed = true;
  }
  destinations = destinations.map((destination) => {
    if (typeof destination.id === 'string' && destination.id.length > 0) return destination;
    changed = true;
    return { ...destination, id: createId() };
  });
  if ('spaceKey' in source || 'parentPageId' in source) changed = true;
  const settings: ConfluencePublisherSettings = {
    ...DEFAULT_SETTINGS,
    ...source,
    destinations,
  } as ConfluencePublisherSettings;
  delete (settings as ConfluencePublisherSettings & { spaceKey?: unknown }).spaceKey;
  delete (settings as ConfluencePublisherSettings & { parentPageId?: unknown }).parentPageId;
  return { settings, changed };
}
```

`src/settings.ts`はUI classだけを残し、型とmigrationを`./domain/settings`から再exportする。

- [ ] **Step 5: metadata reader/writerを実装する**

`src/domain/publication-metadata.ts`へ次のAPIを実装する。

```ts
import type { LegacyPublication, PublicationRecord } from './publication';

export const PUBLICATIONS_KEY = 'confluence-publications';

export function readPublication(
  frontmatter: Record<string, unknown>,
  destinationId: string,
): PublicationRecord | null {
  const publications = frontmatter[PUBLICATIONS_KEY];
  if (!isRecord(publications)) return null;
  const value = publications[destinationId];
  if (!isRecord(value)) return null;
  const required = ['base-url', 'space-key', 'parent-page-id', 'page-id', 'page-url'] as const;
  if (required.some((key) => typeof value[key] !== 'string' || value[key].length === 0)) return null;
  return {
    destinationId,
    baseUrl: value['base-url'] as string,
    spaceKey: value['space-key'] as string,
    parentPageId: value['parent-page-id'] as string,
    pageId: value['page-id'] as string,
    pageUrl: value['page-url'] as string,
  };
}

export function readAllPublications(
  frontmatter: Record<string, unknown>,
): Record<string, PublicationRecord> {
  const publications = frontmatter[PUBLICATIONS_KEY];
  if (!isRecord(publications)) return {};
  return Object.keys(publications).reduce<Record<string, PublicationRecord>>((result, id) => {
    const record = readPublication(frontmatter, id);
    if (record) result[id] = record;
    return result;
  }, {});
}

export function readLegacyPublication(
  frontmatter: Record<string, unknown>,
): LegacyPublication | null {
  const pageId = frontmatter['confluence-page-id'];
  if (typeof pageId !== 'string' || pageId.length === 0) return null;
  const pageUrl = frontmatter['confluence-url'];
  return { pageId, pageUrl: typeof pageUrl === 'string' ? pageUrl : null };
}

export function writePublication(
  frontmatter: Record<string, unknown>,
  record: PublicationRecord,
): Record<string, unknown> {
  const current = isRecord(frontmatter[PUBLICATIONS_KEY])
    ? { ...(frontmatter[PUBLICATIONS_KEY] as Record<string, unknown>) }
    : {};
  current[record.destinationId] = {
    'base-url': record.baseUrl,
    'space-key': record.spaceKey,
    'parent-page-id': record.parentPageId,
    'page-id': record.pageId,
    'page-url': record.pageUrl,
  };
  const next = { ...frontmatter, [PUBLICATIONS_KEY]: current };
  delete next['confluence-page-id'];
  delete next['confluence-url'];
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 6: main.tsでmigrationを一度だけ永続化する**

`loadSettings()`を次の形へ変更する。

```ts
import { randomUUID } from 'crypto';

private async loadSettings(): Promise<void> {
  const data = await this.loadData();
  if (!data) {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    return;
  }
  const migration = migrateSettings(data, randomUUID);
  this.settings = migration.settings;
  if (migration.changed) await this.saveData(this.settings);
}
```

`esbuild.config.mjs`のexternalへ`crypto`を追加する。

- [ ] **Step 7: testと型検査を確認する**

Run: `npm test -- src/domain/settings.test.ts src/domain/publication-metadata.test.ts && npm run typecheck`

Expected: 2 test files passed。型エラーなし。

- [ ] **Step 8: Task 2をcommitする**

```bash
git add src/domain/settings.ts src/domain/settings.test.ts src/domain/publication-metadata.ts src/domain/publication-metadata.test.ts src/settings.ts src/main.ts esbuild.config.mjs
git commit -m "feat: add destination scoped publication metadata"
```

### Task 3: publication planner

**Files:**
- Create: `src/domain/publication-planner.ts`
- Create: `src/domain/publication-planner.test.ts`
- Modify: `src/domain/publication.ts`

- [ ] **Step 1: local preflightの失敗するtestを書く**

`src/domain/publication-planner.test.ts`へ、重複title、重複page ID、destination不一致、未解決画像を一度に検証するtable testを追加する。

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildPublicationPlan } from './publication-planner';

describe('buildPublicationPlan', () => {
  it('returns all local issues before calling the remote repository', async () => {
    const repository = { getPage: vi.fn(), findPagesByTitle: vi.fn() };
    const result = await buildPublicationPlan({
      baseUrl: 'https://example.test',
      destination: { id: 'dest-1', label: 'Docs', spaceKey: '', parentPageId: '' },
      notes: [
        note('a.md', 'Same', 'page-1', unresolvedImage('missing.png')),
        note('b.md', 'Same', 'page-1', null),
      ],
      repository,
      signal: new AbortController().signal,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected issues');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'invalid-destination', 'duplicate-title', 'duplicate-page-id', 'unresolved-image',
    ]));
    expect(repository.getPage).not.toHaveBeenCalled();
  });
});
```

test内の`note()`と`unresolvedImage()`は、`NoteCandidate`を完全な値で返すfactoryとして同じfile内へ定義する。

- [ ] **Step 2: remote recoveryの失敗するtestを書く**

同じtest fileへ次のcaseを追加する。

```ts
it('recovers a stale id only from one exact parent and ownership match', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(null),
    findPagesByTitle: vi.fn().mockResolvedValue([
      page('replacement', 'DOC', '42', ownership('dest-1', 'note.md')),
    ]),
  };
  const result = await buildPublicationPlan(validInput(repository, legacyNote('old-id')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({ pageId: 'replacement', operation: 'update' });
});

it('recovers an owned placeholder when the note has no publication record', async () => {
  const repository = {
    getPage: vi.fn(),
    findPagesByTitle: vi.fn().mockResolvedValue([
      page('placeholder', 'DOC', '42', ownership('dest-1', 'note.md')),
    ]),
  };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({ pageId: 'placeholder', operation: 'update' });
});

it('creates only when title search returns no candidates', async () => {
  const repository = {
    getPage: vi.fn(),
    findPagesByTitle: vi.fn().mockResolvedValue([]),
  };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({ pageId: null, operation: 'create' });
});

it.each([
  [
    'multiple matching candidates',
    [
      page('one', 'DOC', '42', ownership('dest-1', 'note.md')),
      page('two', 'DOC', '42', ownership('dest-1', 'note.md')),
    ],
  ],
  [
    'a matching and an unmarked candidate',
    [
      page('owned', 'DOC', '42', ownership('dest-1', 'note.md')),
      page('human', 'DOC', '42', null),
    ],
  ],
  [
    'a matching candidate in another parent',
    [
      page('owned', 'DOC', '42', ownership('dest-1', 'note.md')),
      page('other-parent', 'DOC', '77', ownership('dest-1', 'note.md')),
    ],
  ],
])('rejects %s', async (_label, candidates) => {
  const repository = { getPage: vi.fn(), findPagesByTitle: vi.fn().mockResolvedValue(candidates) };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('ambiguous-page');
});

it('does not claim an unmarked same-title page', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(null),
    findPagesByTitle: vi.fn().mockResolvedValue([page('human-page', 'DOC', '42', null)]),
  };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('ambiguous-page');
});

it('does not claim a same-title page owned by another source', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(null),
    findPagesByTitle: vi.fn().mockResolvedValue([
      page('other-note', 'DOC', '42', ownership('dest-1', 'other.md')),
    ]),
  };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('ambiguous-page');
});

it('rejects one same-title candidate from another parent', async () => {
  const repository = {
    getPage: vi.fn(),
    findPagesByTitle: vi.fn().mockResolvedValue([
      page('wrong-parent', 'DOC', '77', ownership('dest-1', 'note.md')),
    ]),
  };
  const result = await buildPublicationPlan(validInput(repository, unpublishedNote('note.md')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('ambiguous-page');
});

it('claims ownership only for a validated legacy page id', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(page('legacy', 'DOC', '42', null)),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, legacyNote('legacy')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({ pageId: 'legacy', claimOwnership: true });
});

it('resumes a legacy migration when the expected ownership already exists', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(
      page('legacy', 'DOC', '42', ownership('dest-1', 'note.md')),
    ),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, legacyNote('legacy')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({
    pageId: 'legacy', migrateLegacy: true, claimOwnership: false,
  });
});

it.each([
  ['no ownership', null],
  ['another destination', ownership('dest-2', 'note.md')],
  ['another source', ownership('dest-1', 'other.md')],
])('rejects a new-format saved id with %s', async (_label, pageOwnership) => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(page('saved', 'DOC', '42', pageOwnership)),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, publishedNote('saved')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('destination-mismatch');
});

it('updates a new-format saved id only when ownership matches', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(
      page('saved', 'DOC', '42', ownership('dest-1', 'note.md')),
    ),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, publishedNote('saved')));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected plan');
  expect(result.pages[0]).toMatchObject({ pageId: 'saved', operation: 'update' });
});

it.each([
  ['another destination', ownership('dest-2', 'note.md')],
  ['another source', ownership('dest-1', 'other.md')],
])('rejects a legacy saved id owned by %s', async (_label, pageOwnership) => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(
      page('legacy', 'DOC', '42', pageOwnership),
    ),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, legacyNote('legacy')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('destination-mismatch');
});

it('rejects an existing page from another parent', async () => {
  const repository = {
    getPage: vi.fn().mockResolvedValue(page('existing', 'DOC', '77')),
    findPagesByTitle: vi.fn(),
  };
  const result = await buildPublicationPlan(validInput(repository, publishedNote('existing')));

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected issues');
  expect(result.issues[0].code).toBe('destination-mismatch');
});
```

- [ ] **Step 3: planner testが未実装で失敗することを確認する**

Run: `npm test -- src/domain/publication-planner.test.ts`

Expected: FAIL。`buildPublicationPlan`が存在しない。

- [ ] **Step 4: planner contractをdomain modelへ追加する**

`src/domain/publication.ts`へ次を追加する。

```ts
export interface NoteCandidate extends NoteInput {
  title: string;
  publication: PublicationRecord | null;
  legacyPublication: LegacyPublication | null;
  images: Array<EmbeddedImage | { sourcePath: string; resolvedPath: null }>;
}

export interface PlannedPage {
  note: NoteCandidate;
  pageId: string | null;
  operation: 'create' | 'update';
  migrateLegacy: boolean;
  claimOwnership: boolean;
}

export type PublicationPlanResult =
  | { ok: true; snapshot: DestinationSnapshot; pages: PlannedPage[] }
  | { ok: false; issues: PlanIssue[] };

export interface PageLookup {
  getPage(pageId: string, signal: AbortSignal): Promise<ResolvedPage | null>;
  findPagesByTitle(spaceKey: string, title: string, signal: AbortSignal): Promise<ResolvedPage[]>;
}

export interface PublishRepository extends PageLookup {
  createPage(spaceKey: string, parentId: string, title: string, body: string, signal: AbortSignal): Promise<ResolvedPage>;
  setPageOwnership(pageId: string, ownership: PageOwnership, signal: AbortSignal): Promise<void>;
  deletePage(pageId: string, signal: AbortSignal): Promise<void>;
  updatePage(pageId: string, title: string, body: string, currentVersion: number, signal: AbortSignal): Promise<void>;
  putAttachment(pageId: string, filename: string, data: ArrayBuffer, mimeType: string, signal: AbortSignal): Promise<'created' | 'updated'>;
}
```

- [ ] **Step 5: local validationとremote resolutionを実装する**

`src/domain/publication-planner.ts`へ次のAPIを実装する。

```ts
export async function buildPublicationPlan(input: {
  baseUrl: string;
  destination: Destination;
  notes: NoteCandidate[];
  repository: PageLookup;
  signal: AbortSignal;
}): Promise<PublicationPlanResult> {
  const snapshot = destinationSnapshot(input.baseUrl, input.destination);
  const issues = validateLocalInput(input.notes, snapshot);
  if (issues.length > 0) return { ok: false, issues };

  const pages: PlannedPage[] = [];
  for (const note of input.notes) {
    input.signal.throwIfAborted();
    const resolved = await resolveNotePage(note, snapshot, input.repository, input.signal);
    if ('issue' in resolved) issues.push(resolved.issue);
    else pages.push(resolved.page);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, snapshot, pages };
}
```

`validateLocalInput()`は空destination、title重複、page ID重複、未解決画像、publication snapshot不一致を全件収集する。

legacy publicationにpage URLがある場合は、URLから得たoriginとcontext pathを正規化してsnapshot base URLと比較し、不一致ならremote IDを取得する前に`destination-mismatch`を返す。

legacy page URLがない場合は、現在接続中のbase URL上でpage ID、space、直接parentをすべて検証できた場合だけ移行を許可する。

`resolveNotePage()`は、保存ID取得、404時のtitle検索、spaceと直接parentのfilter、所有権照合、候補0件ならcreate、所有権一致が一件ならupdate、それ以外ならissueという順序にする。

新形式recordの保存IDは、space、直接parent、`destinationId`、`sourcePath`がすべて一致する場合だけupdateする。

旧形式の明示的IDはspaceと直接parentが一致し、所有権が未設定の場合に`claimOwnership: true`とする。期待するdestination IDとsource pathが既に付いている場合は移行途中の再試行として`migrateLegacy: true, claimOwnership: false`にする。別の所有権がある場合は拒否する。

IDなしまたは404後のtitle検索では、検索結果0件だけをcreateとする。検索結果が一件でspace、直接parent、所有権が完全一致する場合だけ回収する。一致候補と未所有、不一致、別parentの候補が混在する場合を含め、複数件または一件の不一致を`ambiguous-page`として拒否する。

- [ ] **Step 6: planner testと全testを確認する**

Run: `npm test -- src/domain/publication-planner.test.ts && npm test && npm run typecheck`

Expected: planner casesと既存testがすべてpassed。型エラーなし。

- [ ] **Step 7: Task 3をcommitする**

```bash
git add src/domain/publication.ts src/domain/publication-planner.ts src/domain/publication-planner.test.ts
git commit -m "feat: validate publication plans before remote writes"
```

### Task 4: Topic 1セルフレビューと独立レビュー

**Files:**
- Review: `src/domain/publication.ts`
- Review: `src/domain/settings.ts`
- Review: `src/domain/publication-metadata.ts`
- Review: `src/domain/publication-planner.ts`
- Review: corresponding `*.test.ts`

- [ ] **Step 1: セルフレビューする**

Run: `git diff ff102e1..HEAD -- src/domain src/settings.ts src/main.ts esbuild.config.mjs package.json tsconfig.json vitest.config.ts`

確認項目は、default object非共有、旧keyの検証前削除がないこと、remote write前にlocal issueを全件返すこと、別parentまたは所有権不一致のページを更新しないこと、legacyだけが所有権を取得できること、signalを全remote callへ渡すこととする。

- [ ] **Step 2: Topic 1の全検証を実行する**

Run: `npm test -- src/domain && npm run typecheck && npm run build && git diff --check`

Expected: all tests passed。型エラーなし。build成功。whitespace errorなし。

- [ ] **Step 3: 独立reviewerへ委譲する**

reviewer promptには次を明記する。

```text
Goal: Topic 1が設計書のdestination別metadata、旧形式移行、重複検出、stale ID recovery、別parent拒否、content property所有権照合を満たすか確認する。
Steps: 設計書を読む。ff102e1..HEADの対象diffを読む。testを実行する。Critical/Important/Minorを行番号付きで報告する。
Constraints: ファイルを変更しない。実装者の説明を根拠にせずコードとtestを検証する。
Output: 問題がなければ単独行でACCEPT。問題があればACCEPTを書かない。
```

- [ ] **Step 4: 指摘を一項目ずつ検証して修正する**

各指摘について、再現testを先に追加してFAILを確認し、最小修正後に対象testと`npm test`を実行する。

修正が必要だった場合は次でcommitする。

```bash
git add src/domain src/settings.ts src/main.ts esbuild.config.mjs package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "fix: address publication planning review"
```

- [ ] **Step 5: 同じreviewerがACCEPTするまで再依頼する**

再依頼には前回指摘、修正commit、追加test、実行結果を含める。

## Topic 2: Markdown parserとStorage Format renderer

### Task 5: Obsidian Markdown extension token

**Files:**
- Create: `src/converter/obsidian-marked-extension.ts`
- Create: `src/converter/obsidian-marked-extension.test.ts`
- Create: `src/converter/types.ts`

- [ ] **Step 1: token型を定義する**

`src/converter/types.ts`へ次を追加する。

```ts
import type { Token, TokensList } from 'marked';

export interface WikiLinkToken {
  type: 'obsidian-wikilink';
  raw: string;
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

export interface ImageEmbedToken {
  type: 'obsidian-image';
  raw: string;
  target: string;
  width: number | null;
  alt: string | null;
}

export interface CalloutToken {
  type: 'obsidian-callout';
  raw: string;
  calloutType: string;
  title: string | null;
  folded: boolean | null;
  tokens: Token[];
}

export interface ParsedMarkdown {
  tokens: TokensList;
  imageTokens: ImageEmbedToken[];
}
```

- [ ] **Step 2: code内をtokenizeしない失敗testを書く**

`src/converter/obsidian-marked-extension.test.ts`へ次を追加する。

```ts
import { describe, expect, it } from 'vitest';
import { parseObsidianMarkdown, walkObsidianTokens } from './obsidian-marked-extension';

describe('parseObsidianMarkdown', () => {
  it('does not parse wiki syntax inside inline or fenced code', () => {
    const parsed = parseObsidianMarkdown([
      '`[[Inline]]`',
      '',
      '```md',
      '[[Fenced]] ![[image.png]]',
      '```',
      '',
      '[[Real#Heading|Shown]]',
    ].join('\n'));

    const custom = walkObsidianTokens(parsed.tokens);
    expect(custom.wikilinks).toEqual([
      expect.objectContaining({ target: 'Real', heading: 'Heading', alias: 'Shown' }),
    ]);
    expect(custom.images).toEqual([]);
  });
});
```

- [ ] **Step 3: callout境界の失敗testを書く**

同じtest fileへ次を追加する。

```ts
it('parses adjacent and EOF callouts as separate recursive blocks', () => {
  const parsed = parseObsidianMarkdown([
    '> [!NOTE]- First',
    '> **bold** [[Page]]',
    '',
    '> [!WARNING]',
  ].join('\n'));

  const custom = walkObsidianTokens(parsed.tokens);
  expect(custom.callouts).toHaveLength(2);
  expect(custom.callouts[0]).toMatchObject({
    calloutType: 'NOTE', title: 'First', folded: true,
  });
  expect(custom.callouts[1]).toMatchObject({
    calloutType: 'WARNING', title: null, folded: null,
  });
  expect(custom.wikilinks).toEqual([
    expect.objectContaining({ target: 'Page' }),
  ]);
});
```

- [ ] **Step 4: testが未実装で失敗することを確認する**

Run: `npm test -- src/converter/obsidian-marked-extension.test.ts`

Expected: FAIL。parser exportが存在しない。

- [ ] **Step 5: marked extensionを実装する**

`src/converter/obsidian-marked-extension.ts`で`Marked`と`MarkedExtension`を使い、callout、image embed、wikilinkの三extensionを登録する。

```ts
const imageEmbedExtension: TokenizerAndRendererExtension = {
  name: 'obsidian-image',
  level: 'inline',
  start(src) { return src.indexOf('![['); },
  tokenizer(src) {
    const match = /^!\[\[([^\]]+)\]\]/.exec(src);
    if (!match) return undefined;
    const { target, alias } = splitWikiTarget(match[1]);
    if (!IMAGE_EXTENSION_RE.test(target)) return undefined;
    const parsedWidth = alias === null ? Number.NaN : Number.parseInt(alias, 10);
    return {
      type: 'obsidian-image',
      raw: match[0],
      target,
      width: Number.isFinite(parsedWidth) ? parsedWidth : null,
      alt: Number.isFinite(parsedWidth) ? null : alias,
    } satisfies ImageEmbedToken;
  },
};

const wikiLinkExtension: TokenizerAndRendererExtension = {
  name: 'obsidian-wikilink',
  level: 'inline',
  start(src) { return src.search(/!?\[\[/); },
  tokenizer(src) {
    const match = /^(!)?\[\[([^\]]+)\]\]/.exec(src);
    if (!match) return undefined;
    const { target, heading, alias } = splitWikiTarget(match[2]);
    if (match[1] && IMAGE_EXTENSION_RE.test(target)) return undefined;
    return {
      type: 'obsidian-wikilink', raw: match[0], target, heading, alias,
      embed: Boolean(match[1]),
    } satisfies WikiLinkToken;
  },
};
```

callout extensionは先頭行`^>\s?\[!(\w+)\]([+-])?\s*(.*)`を認識し、空行または次のcallout開始までの連続blockquote行だけを消費する。

bodyから各行の`>` prefixを一段だけ除去し、`this.lexer.blockTokens(body)`を`CalloutToken.tokens`へ設定する。

extensionへ`childTokens: ['tokens']`を指定し、`walkTokens`がcallout内部も巡回できるようにする。

公開APIは次とする。

```ts
export function parseObsidianMarkdown(markdown: string): ParsedMarkdown {
  const marked = new Marked({ extensions: [calloutExtension, imageEmbedExtension, wikiLinkExtension] });
  const tokens = marked.lexer(markdown);
  const custom = walkObsidianTokens(tokens);
  return { tokens, imageTokens: custom.images };
}

export function walkObsidianTokens(tokens: Token[]): {
  wikilinks: WikiLinkToken[];
  images: ImageEmbedToken[];
  callouts: CalloutToken[];
} {
  const result = { wikilinks: [], images: [], callouts: [] } as {
    wikilinks: WikiLinkToken[];
    images: ImageEmbedToken[];
    callouts: CalloutToken[];
  };
  walk(tokens, (token) => {
    if (token.type === 'obsidian-wikilink') result.wikilinks.push(token as unknown as WikiLinkToken);
    if (token.type === 'obsidian-image') result.images.push(token as unknown as ImageEmbedToken);
    if (token.type === 'obsidian-callout') result.callouts.push(token as unknown as CalloutToken);
  });
  return result;
}
```

- [ ] **Step 6: parser testと型検査を確認する**

Run: `npm test -- src/converter/obsidian-marked-extension.test.ts && npm run typecheck`

Expected: code isolationと二calloutのtestがpassed。型エラーなし。

- [ ] **Step 7: Task 5をcommitする**

```bash
git add src/converter/types.ts src/converter/obsidian-marked-extension.ts src/converter/obsidian-marked-extension.test.ts
git commit -m "feat: parse Obsidian syntax as markdown tokens"
```

### Task 6: Storage Format rendererと添付名

**Files:**
- Create: `src/converter/storage-renderer.ts`
- Create: `src/converter/storage-renderer.test.ts`
- Create: `src/converter/attachment-name.ts`
- Create: `src/converter/attachment-name.test.ts`
- Delete: `src/converter/obsidian-syntax.ts`
- Delete: `src/converter/markdown-to-storage.ts`
- Modify: `esbuild.config.mjs`

- [ ] **Step 1: renderer fixtureの失敗するtestを書く**

`src/converter/storage-renderer.test.ts`へ、link resolverとimage resolverをfakeにした次のtestを追加する。

```ts
import { describe, expect, it } from 'vitest';
import { convertMarkdown } from './storage-renderer';

describe('convertMarkdown', () => {
  it('renders links, recursive callouts, tasks, code, and images as storage XML', () => {
    const result = convertMarkdown([
      '`[[Code]]`',
      '',
      '> [!NOTE] Title',
      '> **bold** [[Page#Section|Shown]]',
      '',
      '- [x] done',
      '',
      '![[assets/diagram.png|600]]',
    ].join('\n'), {
      sourcePath: 'notes/source.md',
      spaceKey: 'DOC',
      pageTitles: new Map([['notes/page.md', 'Published Page']]),
      resolveLink: (target) => target === 'Page' ? 'notes/page.md' : target === 'assets/diagram.png' ? 'assets/diagram.png' : null,
    });

    expect(result.storage).toContain('<code>[[Code]]</code>');
    expect(result.storage).toContain('<ac:structured-macro ac:name="info">');
    expect(result.storage).toContain('<strong>bold</strong>');
    expect(result.storage).toContain('ac:anchor="Section"');
    expect(result.storage).toContain('<ac:task-list>');
    expect(result.storage).toContain('<ac:task-status>complete</ac:task-status>');
    expect(result.storage).toContain('ac:width="600"');
    expect(result.images).toEqual([
      expect.objectContaining({ resolvedPath: 'assets/diagram.png' }),
    ]);
  });
});
```

- [ ] **Step 2: unresolved imageと同名画像の失敗するtestを書く**

同じtest fileへ、resolverが`null`を返す画像を`issues: [{ code: 'unresolved-image' }]`として返すcaseを追加する。

`src/converter/attachment-name.test.ts`へ次を追加する。

```ts
import { expect, it } from 'vitest';
import { attachmentNameForPath } from './attachment-name';

it('keeps the extension and separates equal basenames from different paths', () => {
  const left = attachmentNameForPath('a/diagram.png');
  const right = attachmentNameForPath('b/diagram.png');
  expect(left).toMatch(/^diagram-[0-9a-f]{12}\.png$/);
  expect(right).toMatch(/^diagram-[0-9a-f]{12}\.png$/);
  expect(left).not.toBe(right);
});
```

- [ ] **Step 3: testが未実装で失敗することを確認する**

Run: `npm test -- src/converter/storage-renderer.test.ts src/converter/attachment-name.test.ts`

Expected: FAIL。rendererとattachment helperが存在しない。

- [ ] **Step 4: attachment nameを実装する**

`src/converter/attachment-name.ts`へ次を追加する。

```ts
import { createHash } from 'crypto';

export function attachmentNameForPath(vaultPath: string): string {
  const normalized = vaultPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const filename = parts[parts.length - 1] || normalized;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : '';
  const safeStem = stem.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${safeStem}-${digest}${extension}`;
}
```

`esbuild.config.mjs`のexternalへ`crypto`を追加する。

- [ ] **Step 5: rendererを実装する**

`src/converter/storage-renderer.ts`へ次の公開APIを実装する。

```ts
export interface ConversionContext {
  sourcePath: string;
  spaceKey: string;
  pageTitles: Map<string, string>;
  resolveLink(target: string, sourcePath: string): string | null;
}

export interface ConversionIssue {
  code: 'unresolved-image';
  target: string;
}

export interface ConversionResult {
  storage: string;
  images: EmbeddedImage[];
  issues: ConversionIssue[];
}

export function convertMarkdown(markdown: string, context: ConversionContext): ConversionResult {
  const parsed = parseObsidianMarkdown(markdown);
  const images: EmbeddedImage[] = [];
  const issues: ConversionIssue[] = [];
  const renderer = createStorageRenderer(context, images, issues);
  const marked = new Marked({
    renderer,
    extensions: createObsidianRendererExtensions(context, images, issues),
  });
  return { storage: marked.parser(parsed.tokens) as string, images: dedupeImages(images), issues };
}
```

標準rendererは既存`markdown-to-storage.ts`のheading、code、blockquote、hr、table、strong、em、codespan、br、del、link、external imageを移し、XML escapeを共通`escapeXml()`へ集約する。

list rendererはtask itemの連続区間を`<ac:task-list>`へ、通常itemの連続区間を`<ul>`または`<ol>`へ分割する。

custom rendererは次の規則を実装する。

- wikilink：resolverで得たpathが`pageTitles`にあれば`ri:page`を生成し、headingは`ac:anchor`へ入れる。なければaliasまたはtargetをescapeした文字列にする。
- note embed：公開済みならwikilinkと同じページlinkにし、未公開なら`<em>(see: ...)</em>`にする。
- image embed：resolverがnullならissueを追加し、壊れた`ri:attachment`を生成しない。解決できれば決定的なattachment名を使う。
- callout：typeを`info`、`warning`、`tip`、`note`へmapし、`this.parser.parse(token.tokens)`を`ac:rich-text-body`へ入れる。

旧converter二fileは、全fixtureが新rendererで通った後に削除する。

- [ ] **Step 6: converter testと全testを確認する**

Run: `npm test -- src/converter && npm test && npm run typecheck && npm run build`

Expected: converter fixtureと全testがpassed。型エラーなし。build成功。

- [ ] **Step 7: Task 6をcommitする**

```bash
git add src/converter esbuild.config.mjs main.js
git commit -m "feat: render Confluence storage from markdown tokens"
```

### Task 7: Topic 2セルフレビューと独立レビュー

**Files:**
- Review: `src/converter/`

- [ ] **Step 1: セルフレビューする**

Run: `git diff HEAD~2..HEAD -- src/converter esbuild.config.mjs`

確認項目は、code token内部へcustom tokenizerが入らないこと、calloutの再帰tokenをescape済み文字列として再escapeしないこと、placeholderが残っていないこと、task list schema、anchor、alias、画像重複排除、全XML attributeのescapeとする。

- [ ] **Step 2: Topic 2の全検証を実行する**

Run: `npm test -- src/converter && npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests passed。型エラーなし。build成功。whitespace errorなし。

- [ ] **Step 3: 独立reviewerへ委譲する**

```text
Goal: Topic 2が設計書のtoken tree変換、code保護、callout再帰変換、task list、anchor、添付名、placeholder廃止を満たすか確認する。
Steps: 設計書を読む。Topic 2開始commitからHEADのdiffを読む。converter testを実行する。境界入力を追加で試す。Critical/Important/Minorを行番号付きで報告する。
Constraints: ファイルを変更しない。実装者の説明を根拠にせずコードと出力を検証する。
Output: 問題がなければ単独行でACCEPT。問題があればACCEPTを書かない。
```

- [ ] **Step 4: 指摘を再現testから修正する**

修正ごとにFAIL、最小修正、対象test、全testの順で確認し、次でcommitする。

```bash
git add src/converter esbuild.config.mjs main.js
git commit -m "fix: address storage conversion review"
```

- [ ] **Step 5: 同じreviewerがACCEPTするまで再依頼する**

再依頼には前回指摘ごとのtest名と修正commitを含める。

## Topic 3: Confluence clientと添付ライフサイクル

### Task 8: abort可能なNode.js transport

**Files:**
- Create: `src/confluence/transport.ts`
- Create: `src/confluence/transport.test.ts`
- Modify: `esbuild.config.mjs`

- [ ] **Step 1: protocol制約の失敗するtestを書く**

`src/confluence/transport.test.ts`へ次を追加する。

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { validateConfluenceBaseUrl } from './transport';

describe('validateConfluenceBaseUrl', () => {
  it.each([
    'http://confluence.example.test',
    'ftp://localhost',
  ])('rejects credentials over an unsafe URL: %s', (url) => {
    expect(() => validateConfluenceBaseUrl(url)).toThrow();
  });

  it.each([
    'https://confluence.example.test',
    'http://localhost:8090',
    'http://127.0.0.1:8090',
    'http://[::1]:8090',
  ])('accepts a safe URL: %s', (url) => {
    expect(validateConfluenceBaseUrl(url)).toBeInstanceOf(URL);
  });
});
```

- [ ] **Step 2: timeout、abort、response中断の失敗するtestを書く**

同じtest fileでloopback HTTP serverを各testごとに起動し、次を検証する。

```ts
it('times out a response that never completes', async () => {
  const server = await startServer((_req, res) => { res.writeHead(200); res.write('{'); });
  const transport = new NodeHttpTransport({ baseUrl: server.url, headers: {}, timeoutMs: 20 });
  await expect(transport.requestJson({ method: 'GET', path: '/hang' })).rejects.toMatchObject({
    code: 'timeout',
  });
});

it('aborts an in-flight request', async () => {
  const server = await startServer(() => undefined);
  const controller = new AbortController();
  const request = new NodeHttpTransport({ baseUrl: server.url, headers: {}, timeoutMs: 1_000 })
    .requestJson({ method: 'GET', path: '/abort', signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toMatchObject({ code: 'aborted' });
});
```

server helperは`close()`を返し、`afterEach`で必ずlisten socketを閉じる。

- [ ] **Step 3: testが未実装で失敗することを確認する**

Run: `npm test -- src/confluence/transport.test.ts`

Expected: FAIL。transport exportが存在しない。

- [ ] **Step 4: transport型とURL検証を実装する**

`src/confluence/transport.ts`へ次を追加する。

```ts
export type TransportErrorCode =
  | 'invalid-url' | 'timeout' | 'aborted' | 'network'
  | 'redirect' | 'http' | 'content-type' | 'json';

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export function validateConfluenceBaseUrl(value: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new TransportError('invalid-url', 'Confluence URL must use HTTPS unless it targets loopback.');
  }
  return url;
}
```

IPv6の`URL.hostname`がbracketを含むかNode.js 20でtestし、実値に合わせて`::1`も許可する。

- [ ] **Step 5: NodeHttpTransportを実装する**

公開contractを次に固定する。

```ts
export interface JsonRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

export class NodeHttpTransport {
  constructor(private readonly options: {
    baseUrl: string;
    headers: Record<string, string>;
    timeoutMs?: number;
  }) {}

  requestJson<T>(request: JsonRequest): Promise<T> {
    return this.request(request, true) as Promise<T>;
  }

  requestEmpty(request: JsonRequest): Promise<void> {
    return this.request(request, false) as Promise<void>;
  }

  private request(request: JsonRequest, expectJson: boolean): Promise<unknown>;
}
```

`request()`はbase URLのcontext pathとrequest pathを結合し、protocolから`https`またはloopback用`http` moduleを選ぶ。

request timeout、AbortSignal、responseの`aborted`と`error`を一つのsettle guardへ接続する。

response endではredirect、非2xx、JSON content type、JSON parseの順に検査する。

`request()`は一度だけresolveまたはrejectする`settled` guardを持ち、timeoutとabort時に`req.destroy()`を呼ぶ。

非2xx本文は300文字までに制限し、Authorization headerや全responseをerror messageへ含めない。

- [ ] **Step 6: transport testと型検査を確認する**

Run: `npm test -- src/confluence/transport.test.ts && npm run typecheck`

Expected: protocol、timeout、abort、中断、redirect、JSON errorのtestがpassed。

- [ ] **Step 7: Task 8をcommitする**

```bash
git add src/confluence/transport.ts src/confluence/transport.test.ts esbuild.config.mjs
git commit -m "feat: add abortable Confluence HTTP transport"
```

### Task 9: Confluence repositoryと添付更新

**Files:**
- Create: `src/confluence/repository.ts`
- Create: `src/confluence/repository.test.ts`
- Modify: `src/confluence/types.ts`
- Delete: `src/confluence/client.ts`

- [ ] **Step 1: page location filterの失敗するtestを書く**

`src/confluence/repository.test.ts`へfake transportを使う次のtestを追加する。

```ts
import { describe, expect, it, vi } from 'vitest';
import { ConfluenceRepository } from './repository';

it('returns all exact-title pages so the planner can verify parent identity', async () => {
  const transport = fakeTransport({
    results: [apiPage('one', 'DOC', ['42']), apiPage('two', 'DOC', ['77'])],
    size: 2,
  });
  const repository = new ConfluenceRepository(transport);
  const pages = await repository.findPagesByTitle('DOC', 'Same', signal());

  expect(pages.map((page) => page.parentPageId)).toEqual(['42', '77']);
  expect(transport.requestJson).toHaveBeenCalledWith(expect.objectContaining({
    path: expect.stringContaining('title=Same'),
  }));
});
```

- [ ] **Step 2: 添付pageingと更新endpointの失敗するtestを書く**

同じtest fileへ次を追加する。

```ts
it('follows attachment next links and updates an existing attachment by id', async () => {
  const transport = pagedAttachmentTransport([
    { results: [attachment('a1', 'one.png')], _links: { next: '/rest/api/content/p/child/attachment?start=1' } },
    { results: [attachment('a2', 'two.png')], _links: {} },
  ]);
  const repository = new ConfluenceRepository(transport);
  const attachments = await repository.listAttachments('p', signal());
  await repository.putAttachment('p', 'two.png', bytes('new'), 'image/png', signal());

  expect(attachments.get('two.png')?.id).toBe('a2');
  expect(transport.requestJson).toHaveBeenCalledWith(expect.objectContaining({
    path: '/rest/api/content/p/child/attachment/a2/data',
  }));
});
```

- [ ] **Step 3: testが未実装で失敗することを確認する**

Run: `npm test -- src/confluence/repository.test.ts`

Expected: FAIL。repository exportが存在しない。

- [ ] **Step 4: API response型を拡張する**

`src/confluence/types.ts`を次のsubsetに揃える。

```ts
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
```

未使用の`PageInfo`と古いcommentを削除する。

- [ ] **Step 5: repository page APIを実装する**

`src/confluence/repository.ts`へ次のmethodを実装する。

```ts
export class ConfluenceRepository implements PublishRepository {
  private attachmentCache = new Map<string, Map<string, ConfluenceAttachmentResponse>>();

  constructor(private readonly transport: NodeHttpTransport) {}

  getPage(pageId: string, signal: AbortSignal): Promise<ResolvedPage | null>;
  findPagesByTitle(spaceKey: string, title: string, signal: AbortSignal): Promise<ResolvedPage[]>;
  createPage(spaceKey: string, parentId: string, title: string, body: string, signal: AbortSignal): Promise<ResolvedPage>;
  setPageOwnership(pageId: string, ownership: PageOwnership, signal: AbortSignal): Promise<void>;
  deletePage(pageId: string, signal: AbortSignal): Promise<void>;
  updatePage(pageId: string, title: string, body: string, currentVersion: number, signal: AbortSignal): Promise<void>;
  listAttachments(pageId: string, signal: AbortSignal): Promise<Map<string, ConfluenceAttachmentResponse>>;
  putAttachment(pageId: string, filename: string, data: ArrayBuffer, mimeType: string, signal: AbortSignal): Promise<'created' | 'updated'>;
}
```

`getPage()`だけはstatus 404の`TransportError`を`null`へ変換し、ほかのerrorは伝播する。

`getPage()`と`findPagesByTitle()`は`expand=version,ancestors,space,metadata.properties.obsidian-confluence-publisher`をqueryへ含め、property valueをruntime検証して`ResolvedPage.ownership`へ写す。壊れたpropertyは所有権なしとして扱わず、安全側でrepository errorにする。

`findPagesByTitle()`は`spaceKey`、`title`、`type=page`をqueryへ含め、候補を削らず返す。

`setPageOwnership()`は`POST /rest/api/content/{pageId}/property`へkeyとvalueを送る。plannerが未設定と確認した新規またはlegacy pageだけが呼ぶため、既存propertyの409は伝播させ、上書きしない。

`deletePage()`は`DELETE /rest/api/content/{pageId}`を呼び、Publisherが直前に新規作成したplaceholderのrollbackだけに使用する。

- [ ] **Step 6: 所有権propertyとrollback APIの失敗するtestを書く**

property付きpage responseが`ResolvedPage.ownership`へ変換されること、未設定pageへのproperty POST、page DELETEのpathとsignalをfake transportで検証する。

壊れたproperty valueとproperty POSTの409がerrorとして伝播し、別source pathのpropertyを上書きしないことも検証する。

- [ ] **Step 7: 添付APIとmultipart builderを実装する**

`listAttachments()`は最初のpathから開始し、`_links.next`がなくなるまで取得してtitle mapとcacheを更新する。

`putAttachment()`はcacheがなければ一覧を取得し、既存titleなら`/{attachmentId}/data`、未登録なら`/child/attachment`へmultipart POSTする。

どちらのendpointもJSON responseから返却attachmentを取得し、成功後のIDとtitleでcacheを更新する。

multipart builderは次のguardを持つ。

```ts
function quoteMultipartFilename(filename: string): string {
  if (/[\r\n]/.test(filename)) throw new Error('Attachment filename contains a line break.');
  return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

成功後はcacheへ返却attachmentを追加または置換し、同一publish内の二重POSTを防ぐ。

旧`client.ts`はrepositoryへ全call siteが移るTask 11まで互換wrapperとして残してもよいが、Task 11のcommitまでに削除する。

- [ ] **Step 8: repository testと全testを確認する**

Run: `npm test -- src/confluence && npm test && npm run typecheck`

Expected: page mapping、404、ownership read/write、rollback DELETE、pagination、new upload、update upload、filename guardがpassed。

- [ ] **Step 9: Task 9をcommitする**

```bash
git add src/confluence
git commit -m "feat: add location-aware Confluence repository"
```

### Task 10: Topic 3セルフレビューと独立レビュー

**Files:**
- Review: `src/confluence/`

- [ ] **Step 1: セルフレビューする**

Run: `git diff HEAD~2..HEAD -- src/confluence esbuild.config.mjs`

確認項目は、非loopback HTTPでAuthorizationを生成しないこと、全requestへtimeoutとsignalを渡すこと、response中断でsettleすること、404以外を握りつぶさないこと、所有権propertyを上書きしないこと、DELETEがrollback用途に限定されること、attachment全page取得、既存ID更新、multipart header injection防止とする。

- [ ] **Step 2: Topic 3の全検証を実行する**

Run: `npm test -- src/confluence && npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests passed。型エラーなし。build成功。whitespace errorなし。

- [ ] **Step 3: 独立reviewerへ委譲する**

```text
Goal: Topic 3が設計書のHTTPS制約、timeout、abort、response中断、ページidentity、content property取得・POST・409上書き拒否、rollback DELETE、添付pagination、既存添付更新、multipart安全性を満たすか確認する。
Steps: 設計書を読む。Topic 3開始commitからHEADのdiffを読む。confluence testを実行する。socketとPromiseのsettle path、property response検証、DELETE pathとsignalを追う。Critical/Important/Minorを行番号付きで報告する。
Constraints: ファイルを変更しない。認証情報をlogへ出さない。実装者の説明を根拠にしない。
Output: 問題がなければ単独行でACCEPT。問題があればACCEPTを書かない。
```

- [ ] **Step 4: 指摘を再現testから修正する**

修正が必要なら、指摘ごとのFAILとPASSを確認して次でcommitする。

```bash
git add src/confluence esbuild.config.mjs main.js
git commit -m "fix: address Confluence transport review"
```

- [ ] **Step 5: 同じreviewerがACCEPTするまで再依頼する**

再依頼には前回指摘ごとの再現testと、timeoutまたはabort testの終了時間を含める。

## Topic 4: Publisher orchestration、設定、UI

### Task 11: note repositoryとPublisher application service

**Files:**
- Create: `src/obsidian/note-repository.ts`
- Create: `src/obsidian/note-repository.test.ts`
- Rewrite: `src/publisher.ts`
- Create: `src/publisher.test.ts`
- Delete: `src/confluence/client.ts`

- [ ] **Step 1: note repositoryの失敗するtestを書く**

`src/obsidian/note-repository.test.ts`へfake vaultを使い、frontmatter分離と設定反映を検証する。

```ts
import { describe, expect, it } from 'vitest';
import { parseNoteSource, selectPublishContent } from './note-repository';

describe('note source', () => {
  const raw = ['---', 'title: Example', '---', '# Body'].join('\n');

  it('keeps raw and body so stripFrontmatter controls published content', () => {
    const source = parseNoteSource('note.md', 'note', raw);
    expect(source.body).toBe('# Body');
    expect(selectPublishContent(source, true)).toBe('# Body');
    expect(selectPublishContent(source, false)).toBe(raw);
  });

  it('returns an issue instead of treating invalid YAML as body', () => {
    expect(() => parseNoteSource('bad.md', 'bad', '---\ninvalid: [\n---\nbody')).toThrow();
  });
});
```

- [ ] **Step 2: Publisher二段階処理の失敗するtestを書く**

`src/publisher.test.ts`へfake note repository、fake Confluence repository、fake converterを使う次のtestを追加する。

```ts
it('does not start content updates when one page creation fails', async () => {
  const remote = fakeRepository({ createPageFailureFor: 'Second' });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md'), file('second.md')], destination(), signal(),
  ));

  expect(remote.updatePage).not.toHaveBeenCalled();
  expect(events).toContainEqual(expect.objectContaining({ type: 'failed', phase: 'page-resolution' }));
});

it('continues other pages after one attachment update fails', async () => {
  const remote = fakeRepository({ attachmentFailureForPage: 'page-1' });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md'), file('second.md')], destination(), signal(),
  ));

  expect(remote.updatePage).toHaveBeenCalledWith('page-2', expect.anything(), expect.anything(), expect.anything(), expect.anything());
  expect(events[events.length - 1]).toMatchObject({ type: 'complete', succeeded: 1, failed: 1 });
});

it('rolls back only the page whose ownership creation fails', async () => {
  const remote = fakeRepository({ ownershipFailureFor: 'Second' });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md'), file('second.md')], destination(), signal(),
  ));

  expect(remote.deletePage).toHaveBeenCalledTimes(1);
  expect(remote.deletePage).toHaveBeenCalledWith('page-2', expect.any(AbortSignal));
  expect(remote.deletePage).not.toHaveBeenCalledWith('page-1', expect.any(AbortSignal));
  expect(remote.updatePage).not.toHaveBeenCalled();
  expect(events).toContainEqual(expect.objectContaining({ type: 'failed', phase: 'page-resolution' }));
});

it('reports the exact page id and fallback URL in one event when ownership and rollback both fail', async () => {
  const remote = fakeRepository({ ownershipFailureFor: 'First', deleteFailureFor: 'page-1' });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md')], destination(), signal(),
  ));

  const failure = events.find((event) => event.type === 'failed');
  expect(events.filter((event) => event.type === 'failed')).toHaveLength(1);
  expect(failure).toMatchObject({ type: 'failed' });
  if (!failure || failure.type !== 'failed') throw new Error('expected failure');
  expect(failure.error).toContain('page-1');
  expect(failure.error).toContain(
    'https://example.test/confluence/pages/viewpage.action?pageId=page-1',
  );
});

it('does not delete an existing legacy page when ownership creation fails', async () => {
  const remote = fakeRepository({ legacyOwnershipFailureFor: 'First' });
  await collect(new Publisher(dependencies(remote)).publish(
    [legacyFile('first.md')], destination(), signal(),
  ));

  expect(remote.deletePage).not.toHaveBeenCalled();
  expect(remote.updatePage).not.toHaveBeenCalled();
});

it('uses one independent bounded cleanup after cancel interrupts ownership creation', async () => {
  const controller = new AbortController();
  const remote = fakeRepository({ abortOwnershipFor: 'First', onOwnershipStart: () => controller.abort() });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md'), file('second.md')], destination(), controller.signal,
  ));

  expect(remote.deletePage).toHaveBeenCalledTimes(1);
  expect(remote.deletePage.mock.calls[0][1]).not.toBe(controller.signal);
  expect(remote.createPage).toHaveBeenCalledTimes(1);
  expect(remote.updatePage).not.toHaveBeenCalled();
  expect(events[events.length - 1]).toMatchObject({ type: 'cancelled' });
});

it('aborts the cleanup signal at exactly five seconds', () => {
  vi.useFakeTimers();
  try {
    const cleanup = createCleanupSignal();
    expect(cleanup.signal.aborted).toBe(false);

    vi.advanceTimersByTime(4_999);
    expect(cleanup.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(cleanup.signal.aborted).toBe(true);
    cleanup.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it('disposes the cleanup timer after DELETE settles', () => {
  vi.useFakeTimers();
  try {
    const cleanup = createCleanupSignal();
    vi.advanceTimersByTime(4_999);
    cleanup.dispose();

    vi.advanceTimersByTime(5_000);
    expect(cleanup.signal.aborted).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it('reports the orphan id and URL if cancel cleanup also fails', async () => {
  const controller = new AbortController();
  const remote = fakeRepository({
    abortOwnershipFor: 'First',
    deleteFailureFor: 'page-1',
    onOwnershipStart: () => controller.abort(),
  });
  const events = await collect(new Publisher(dependencies(remote)).publish(
    [file('first.md')], destination(), controller.signal,
  ));

  const failure = events.find((event) => event.type === 'failed');
  expect(events.filter((event) => event.type === 'failed')).toHaveLength(1);
  expect(failure).toMatchObject({ type: 'failed' });
  if (!failure || failure.type !== 'failed') throw new Error('expected failure');
  expect(failure.error).toContain('page-1');
  expect(failure.error).toContain(
    'https://example.test/confluence/pages/viewpage.action?pageId=page-1',
  );
  expect(remote.deletePage).toHaveBeenCalledTimes(1);
  expect(remote.updatePage).not.toHaveBeenCalled();
  expect(events[events.length - 1]).toMatchObject({ type: 'cancelled' });
});
```

- [ ] **Step 3: partial publish link mapとfrontmatter順序の失敗testを書く**

同じtest fileへ、未選択の公開済みノートを`noteRepository.listPublished(destination.id)`が返すcaseを追加する。

converterへ渡された`pageTitles`が未選択ノートを含むことをassertする。

別caseで`remote.updatePage`失敗時に`noteRepository.writePublication`が呼ばれず、成功時だけremote updateの後に呼ばれることを`invocationCallOrder`でassertする。

- [ ] **Step 4: testが旧実装に対して失敗することを確認する**

Run: `npm test -- src/obsidian/note-repository.test.ts src/publisher.test.ts`

Expected: FAIL。new constructor contract、strip selection、二段階error policyが存在しない。

- [ ] **Step 5: note repository contractを実装する**

`src/obsidian/note-repository.ts`へ次を実装する。

```ts
export interface NoteFileRef {
  path: string;
  basename: string;
  extension: string;
}

export interface NoteRepository {
  read(file: NoteFileRef): Promise<NoteInput>;
  listMarkdownFiles(): NoteFileRef[];
  listPublished(destinationId: string): Promise<Array<{ path: string; title: string; record: PublicationRecord }>>;
  listPublicationCandidates(destinationId: string): Promise<NoteFileRef[]>;
  resolveLink(target: string, sourcePath: string): string | null;
  readBinary(path: string): Promise<ArrayBuffer>;
  writePublication(file: NoteFileRef, record: PublicationRecord): Promise<void>;
}

export function parseNoteSource(path: string, basename: string, raw: string): NoteInput;
export function selectPublishContent(note: NoteInput, stripFrontmatter: boolean): string;
```

`ObsidianNoteRepository`は`App`を受け、`vault.cachedRead`、`metadataCache.getFirstLinkpathDest`、`vault.readBinary`、`fileManager.processFrontMatter`をadapterする。

`writePublication()`は`writePublication(frontmatter, record)`の返却値で既存objectを置換し、本文には触れない。

- [ ] **Step 6: Publisher eventと依存contractを定義する**

`src/publisher.ts`を次の依存へ書き換える。

```ts
export type ProgressEvent =
  | { type: 'planned'; total: number }
  | { type: 'page-created'; title: string }
  | { type: 'attachment-created' | 'attachment-updated'; title: string; filename: string }
  | { type: 'page-updated'; title: string }
  | { type: 'failed'; title: string | null; phase: 'preflight' | 'page-resolution' | 'content-update'; error: string }
  | { type: 'cancelled'; succeeded: number; failed: number }
  | { type: 'complete'; succeeded: number; failed: number };

export interface PublisherDependencies {
  notes: NoteRepository;
  repository: PublishRepository;
  settings: Pick<ConfluencePublisherSettings, 'confluenceUrl' | 'stripFrontmatter' | 'titleSource'>;
}

export class Publisher {
  constructor(private readonly dependencies: PublisherDependencies) {}

  async *publish(
    files: NoteFileRef[],
    destination: Destination,
    signal: AbortSignal,
  ): AsyncGenerator<ProgressEvent>;
}

export interface CleanupSignal {
  signal: AbortSignal;
  dispose(): void;
}

export function createCleanupSignal(): CleanupSignal;
```

- [ ] **Step 7: Publisherの処理順序を実装する**

`publish()`は次の順序を固定する。

1. signal、Markdown extension、destinationを検査する。
2. noteを読み、titleを解決し、`selectPublishContent()`を選ぶ。
3. `convertMarkdown()`をanalysis用に呼び、未解決画像をcandidateへ載せる。
4. `buildPublicationPlan()`を呼び、issueがあれば`failed`と`complete`を返して終了する。
5. create予定pageを順に作り、直後にdestination IDとsource pathの所有権propertyを保存する。property保存失敗時は、その実行で直前に作ったpageだけを削除する。削除には利用者signalと別の5秒timeout付きsignalを使い、一度だけ試行する。Cancel後に許可する新規通信はこのcleanupだけであり、次pageと第二段階へ進まない。削除も失敗した場合は単一の`failed` eventへpage IDとURLを含める。
6. `claimOwnership`のlegacy pageへ所有権propertyを保存する。失敗時は既存pageを削除せず、第二段階へ進まない。
7. vault全体の同destination publicationと今回のpageを`pageTitles`へまとめる。
8. 各pageを再変換し、imageをattachment名で重複排除して`putAttachment()`する。
9. current page versionを取得して`updatePage()`する。
10. 成功後だけ`writePublication()`する。
11. AbortErrorなら`cancelled`を一回返し、それ以外のページ別errorは`failed`へ数える。

所有権valueは`{ schemaVersion: 1, destinationId: destination.id, sourcePath: note.path }`へ固定する。新形式recordの既存pageはplannerがproperty一致を確認済みであり、再保存しない。

添付のMIME type helperは`png`、`jpg`、`jpeg`、`gif`、`svg`、`webp`を明示し、ほかを`application/octet-stream`にする。

Confluence URLは`webui`が相対pathの場合だけbase URLと結合し、absolute URLならそのoriginが設定base URLと一致する場合に限り採用する。

`webui`がない場合は、正規化したbase URLへ`/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`を結合してrollback通知URLを生成する。

`createCleanupSignal()`は5秒後にabortする独立した`AbortController`と、成功時にtimerを解除する`dispose()`を返す。PublisherはDELETEの`finally`で必ず`dispose()`する。

- [ ] **Step 8: Publisher testと全testを確認する**

Run: `npm test -- src/obsidian src/publisher.test.ts && npm test && npm run typecheck && npm run build`

Expected: strip setting、phase stop、ownership rollback、legacy ownership、page continuation、partial link map、write order、cancelがpassed。全testとbuild成功。

- [ ] **Step 9: 旧clientを削除してTask 11をcommitする**

```bash
git add src/obsidian src/publisher.ts src/publisher.test.ts src/confluence/client.ts src/confluence/types.ts main.js
git commit -m "feat: orchestrate validated two-phase publishing"
```

### Task 12: command、設定validation、進捗、cancel

**Files:**
- Create: `src/domain/validation.ts`
- Create: `src/domain/validation.test.ts`
- Create: `src/ui/progress-state.ts`
- Create: `src/ui/progress-state.test.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`
- Modify: `src/ui/file-select-modal.ts`
- Modify: `src/ui/destination-select-modal.ts`
- Modify: `src/ui/progress-modal.ts`

- [ ] **Step 1: pure validationの失敗するtestを書く**

`src/domain/validation.test.ts`へ次を追加する。

```ts
import { describe, expect, it } from 'vitest';
import { validateDestination, validatePublishFiles } from './validation';

describe('publish input validation', () => {
  it('rejects incomplete destinations and non-markdown files', () => {
    expect(validateDestination({ id: 'd', label: '', spaceKey: '', parentPageId: '' })).toEqual([
      'Space key is required.', 'Parent page ID is required.',
    ]);
    expect(validatePublishFiles([{ path: 'image.png', extension: 'png' }])).toEqual([
      'image.png is not a Markdown file.',
    ]);
  });
});
```

- [ ] **Step 2: progress reducerの失敗するtestを書く**

`src/ui/progress-state.test.ts`へ次を追加する。

```ts
import { expect, it } from 'vitest';
import { initialProgressState, reduceProgress } from './progress-state';

it('counts pages rather than the two internal phases', () => {
  const planned = reduceProgress(initialProgressState(), { type: 'planned', total: 2 });
  const updated = reduceProgress(planned, { type: 'page-updated', title: 'One' });
  expect(updated.label).toBe('Publishing 1 / 2 pages...');
  expect(updated.completedPages).toBe(1);
});

it('stays cancelled instead of displaying complete', () => {
  const cancelled = reduceProgress(initialProgressState(), { type: 'cancelled', succeeded: 0, failed: 0 });
  expect(cancelled.done).toBe(true);
  expect(cancelled.label).toBe('Publishing cancelled.');
});
```

- [ ] **Step 3: testが未実装で失敗することを確認する**

Run: `npm test -- src/domain/validation.test.ts src/ui/progress-state.test.ts`

Expected: FAIL。validationとreducer exportが存在しない。

- [ ] **Step 4: validationとprogress reducerを実装する**

`src/domain/validation.ts`は`validateDestination()`と`validatePublishFiles()`を実装し、すべてのerror文字列を配列で返す。

`src/ui/progress-state.ts`は次のstateをeventごとに更新するpure reducerとする。

```ts
export interface ProgressState {
  totalPages: number;
  completedPages: number;
  succeeded: number;
  failed: number;
  done: boolean;
  cancelled: boolean;
  label: string;
}

export function initialProgressState(): ProgressState;
export function reduceProgress(state: ProgressState, event: ProgressEvent): ProgressState;
```

`page-created`とattachment eventはlogだけに使い、`completedPages`を増やさない。

`page-updated`と`failed`の`content-update`だけが完了ページ数を増やす。

- [ ] **Step 5: command実行を排他する**

`src/main.ts`へ次のfieldとguardを追加する。

```ts
private activePublish: AbortController | null = null;

private async runPublish(files: TFile[], destination: Destination): Promise<void> {
  if (this.activePublish) {
    new Notice('A Confluence publish is already running.');
    return;
  }
  const errors = [
    ...validateDestination(destination),
    ...validatePublishFiles(files),
  ];
  if (errors.length > 0) {
    new Notice(errors.join('\n'));
    return;
  }
  const controller = new AbortController();
  this.activePublish = controller;
  const modal = new ProgressModal(this.app, () => controller.abort());
  modal.open();
  try {
    const publisher = this.createPublisher();
    for await (const event of publisher.publish(files, destination, controller.signal)) {
      modal.handleEvent(event);
    }
  } finally {
    this.activePublish = null;
  }
}
```

`createPublisher()`は`ObsidianNoteRepository`、`NodeHttpTransport`、`ConfluenceRepository`を組み立てる。

Authorization headerはURL validation成功後に構築する。

- [ ] **Step 6: commandとmodalの挙動を修正する**

- `publish-current`の`checkCallback`はactive fileの`extension === 'md'`を要求する。
- FileSelectModalのactive file事前選択もMarkdownだけに限定する。
- destination suggestionは`validateDestination(dest).length === 0`の要素だけを返す。
- update commandはdestinationを先に選び、`listPublicationCandidates(destination.id)`で対象fileを決める。実装は同destinationの新recordを持つfileと旧keyを持つfileを返し、publisherがremote validationする。
- ProgressModal constructorは`onCancel`を受け、実行中buttonを`Cancel`、終了後を`Close`にする。
- ProgressModalの`onClose()`は未完了なら`onCancel()`を一度だけ呼ぶ。
- `handleEvent()`は`reduceProgress()`の返却値からstatusとprogress valueを更新する。
- ProgressModalの`ProgressEvent` importを`../publisher`へ変更し、`src/confluence/types.ts`から旧event unionを削除する。

- [ ] **Step 7: settings UIへ行単位validationを表示する**

各destination rowでspace keyまたはparent IDが空の場合、descriptionへ不足fieldを表示する。

公開操作のvalidationを正本とし、UI表示だけで安全性を保証しない。

- [ ] **Step 8: UI関連pure testと全testを確認する**

Run: `npm test -- src/domain/validation.test.ts src/ui/progress-state.test.ts && npm test && npm run typecheck && npm run build`

Expected: validation、page count、cancel stateがpassed。全testとbuild成功。

- [ ] **Step 9: Task 12をcommitする**

```bash
git add src/main.ts src/settings.ts src/domain/validation.ts src/domain/validation.test.ts src/ui main.js
git commit -m "feat: validate and cancel publish operations"
```

### Task 13: Topic 4セルフレビューと独立レビュー

**Files:**
- Review: `src/publisher.ts`
- Review: `src/obsidian/`
- Review: `src/main.ts`
- Review: `src/settings.ts`
- Review: `src/ui/`

- [ ] **Step 1: セルフレビューする**

Run: `git diff HEAD~2..HEAD -- src/publisher.ts src/obsidian src/main.ts src/settings.ts src/ui src/domain/validation.ts`

確認項目は、preflight前のremote writeがないこと、page作成直後のproperty保存、legacy claimと付与済み再試行、property失敗時に直前の新規pageだけをrollbackすること、rollback失敗時のIDとURL、Cancel時の独立した最大一回・5秒上限のcleanup、pass 1失敗後にpass 2へ進まないこと、page別errorの継続、frontmatter write順序、stripFrontmatter、vault全体link map、Markdown限定、空destination、二重実行、modal closeとcancelの同一signalとする。

- [ ] **Step 2: Topic 4の全検証を実行する**

Run: `npm test -- src/publisher.test.ts src/obsidian src/ui src/domain/validation.test.ts && npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests passed。型エラーなし。build成功。whitespace errorなし。

- [ ] **Step 3: 独立reviewerへ委譲する**

```text
Goal: Topic 4が設計書の二段階公開、property直後保存、legacy claimと再試行、rollback、rollback失敗時のID/URL、部分更新link map、失敗伝播、frontmatter順序、strip setting、入力検証、排他、cancelを満たすか確認する。
Steps: 設計書を読む。Topic 4開始commitからHEADのdiffを読む。publisherとpure UI testを実行する。AsyncGeneratorの終了path、property保存順、既存pageを削除しない条件、CancelSignalとcleanup signalの分離、cleanupの最大一回と5秒timeoutを追う。Critical/Important/Minorを行番号付きで報告する。
Constraints: ファイルを変更しない。Obsidian runtimeが必要な箇所はpure boundaryと型から評価する。実装者の説明を根拠にしない。
Output: 問題がなければ単独行でACCEPT。問題があればACCEPTを書かない。
```

- [ ] **Step 4: 指摘を再現testから修正する**

修正が必要なら次でcommitする。

```bash
git add src main.js
git commit -m "fix: address publish orchestration review"
```

- [ ] **Step 5: 同じreviewerがACCEPTするまで再依頼する**

再依頼には前回指摘、追加test、AbortSignalまたはevent列の実行結果を含める。

## Topic 5: ドキュメント、CI、Release

### Task 14: README、設計文書、license

**Files:**
- Create: `LICENSE`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: MIT licenseとpackage metadataを追加する**

`LICENSE`へMIT License全文、`Copyright (c) 2026 yuuk1`を追加する。

`package.json`へ次を追加する。

```json
{
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yuuki/obsidian-confluence-publisher.git"
  }
}
```

Run: `npm install --package-lock-only`

Expected: package metadataがlockfileへ反映される。

- [ ] **Step 2: READMEを新しい利用規則へ更新する**

READMEのfrontmatter例を次へ変更する。

```yaml
confluence-publications:
  550e8400-e29b-41d4-a716-446655440000:
    base-url: https://confluence.example.com
    space-key: DOC
    parent-page-id: "12345"
    page-id: "67890"
    page-url: https://confluence.example.com/pages/viewpage.action?pageId=67890
```

次を明記する。

- 旧`confluence-page-id`と`confluence-url`は次回成功時に検証付きで移行される。
- pageにはplugin所有権content propertyが保存され、人手で作られた同名pageは自動更新されない。
- HTTPはloopbackだけ許可される。
- 同名画像はpath由来の添付名で区別され、再公開時に更新される。
- 公開中はCancelでき、所有権property付きの作成済みplaceholder pageだけが次回実行で回収される。
- 所有権保存とrollbackがともに失敗した孤立placeholderは、通知されたpage IDとURLから手動で確認する。
- update commandは選択destinationに属するノートだけを更新する。
- BRATにはGitHub Release assetが必要で、`v0.1.0`以降を対象にする。

- [ ] **Step 3: CLAUDE.mdのarchitectureを更新する**

古いplaceholder strategyと旧module treeを削除し、domain、converter、transport、repository、obsidian adapter、Publisher application serviceの責務を書く。

「No test suite」を削除し、`npm test`、`npm run typecheck`、`npm run check`をbuild commandsへ追加する。

- [ ] **Step 4: documentation checkを実行する**

Run: `rg -n "confluence-page-id|No test suite|placeholder strategy|already-uploaded images are skipped" README.md CLAUDE.md`

Expected: 旧keyはmigration説明だけに残り、ほかの旧説明は0 matches。

- [ ] **Step 5: Task 14をcommitする**

```bash
git add LICENSE README.md CLAUDE.md package.json package-lock.json
git commit -m "docs: document safe multi-destination publishing"
```

### Task 15: CI、version検査、Release workflow

**Files:**
- Create: `scripts/verify-version.mjs`
- Create: `scripts/verify-version.test.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`

- [ ] **Step 1: version検査の失敗するtestを書く**

`scripts/verify-version.mjs`からpure functionをexportし、`scripts/verify-version.test.ts`へ次を追加する。

```ts
import { expect, it } from 'vitest';
import { verifyVersions } from './verify-version.mjs';

it('rejects a manifest and tag mismatch', () => {
  expect(() => verifyVersions({ packageVersion: '0.1.0', manifestVersion: '0.1.1', tag: 'v0.1.0' }))
    .toThrow('Version mismatch');
});
```

Vitest includeを`['src/**/*.test.ts', 'scripts/**/*.test.ts']`へ拡張する。

- [ ] **Step 2: testが未実装で失敗することを確認する**

Run: `npm test -- scripts/verify-version.test.ts`

Expected: FAIL。scriptまたはexportが存在しない。

- [ ] **Step 3: version検査scriptを実装する**

`scripts/verify-version.mjs`は`package.json`と`manifest.json`を読み、環境変数`GITHUB_REF_NAME`が存在する場合は先頭`v`を除いたtagとも比較する。

公開APIを次にする。

```js
export function verifyVersions({ packageVersion, manifestVersion, tag }) {
  const normalizedTag = tag ? tag.replace(/^v/, '') : packageVersion;
  if (packageVersion !== manifestVersion || packageVersion !== normalizedTag) {
    throw new Error(`Version mismatch: package=${packageVersion}, manifest=${manifestVersion}, tag=${normalizedTag}`);
  }
}
```

direct execution時は成功なら`Version 0.1.0 is consistent.`をstdoutへ出す。

`package.json`へ`"verify:version": "node scripts/verify-version.mjs"`を追加し、`check`を`npm run typecheck && npm test && npm run verify:version && npm run build`へ変更する。

- [ ] **Step 4: CI workflowを追加する**

`.github/workflows/ci.yml`は`pull_request`と`push`の`main`で実行し、次のstepを持つ。

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run check
      - name: Verify committed bundle
        run: git diff --exit-code -- main.js
```

- [ ] **Step 5: Release workflowを追加する**

`.github/workflows/release.yml`は`v*` tag pushで実行し、`contents: write`だけを付与する。

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run check
        env:
          GITHUB_REF_NAME: ${{ github.ref_name }}
      - run: git diff --exit-code -- main.js
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
```

- [ ] **Step 6: CI相当checkを実行する**

Run: `npm test -- scripts/verify-version.test.ts && npm run check && git diff --exit-code -- main.js && git diff --check`

Expected: all tests passed。version一致。build成功。`main.js`差分なし。whitespace errorなし。

- [ ] **Step 7: Task 15をcommitする**

```bash
git add scripts vitest.config.ts .github/workflows package.json package-lock.json main.js
git commit -m "ci: verify and release plugin artifacts"
```

### Task 16: Topic 5レビューと統合レビュー

**Files:**
- Review: repository-wide diff from `origin/main` to `HEAD`

- [ ] **Step 1: Topic 5セルフレビューする**

Run: `git diff HEAD~2..HEAD -- README.md CLAUDE.md LICENSE package.json package-lock.json scripts .github`

確認項目は、READMEと実装のfrontmatterおよび所有権propertyの一致、旧仕様説明の残存、license、CI権限の最小化、tag/version一致、release assets、build後dirty checkとする。

- [ ] **Step 2: 独立reviewerへTopic 5を委譲する**

```text
Goal: Topic 5のREADME、CLAUDE.md、license、CI、version検査、Release workflowが実装と一致し、BRAT assetsを生成できるか確認する。
Steps: 設計書を読む。Topic 5 diffを読む。npm run checkとversion testを実行する。workflow YAMLと権限を確認する。
Constraints: ファイルを変更しない。外部Releaseを作成しない。
Output: 問題がなければ単独行でACCEPT。問題があれば行番号付きで報告してACCEPTを書かない。
```

- [ ] **Step 3: Topic 5 reviewerがACCEPTするまで修正する**

指摘はtestまたはworkflowのstatic checkを追加してから直し、次でcommitする。

```bash
git add README.md CLAUDE.md LICENSE package.json package-lock.json scripts .github main.js
git commit -m "fix: address release readiness review"
```

- [ ] **Step 4: freshな統合reviewerへ全体レビューを委譲する**

```text
Goal: origin/main..HEADの全変更が設計書の受け入れ条件を満たし、各Topicの境界をまたぐ回帰がないか確認する。
Steps: 設計書と実装計画を読む。全diffを読む。npm run checkを実行する。主要failure path、destination identity、content property所有権、converterからattachment、Publisherからtransportへのsignalを横断して追う。
Constraints: ファイルを変更しない。過去reviewerのACCEPTを根拠にしない。
Output: Critical/Important/Minorを行番号付きで報告する。問題がなければ単独行でACCEPT。
```

- [ ] **Step 5: 統合reviewerがACCEPTするまで修正する**

各指摘を再現testから直し、次でcommitする。

```bash
git add -A
git commit -m "fix: address integrated publisher review"
```

### Task 17: PR、CI、merge、v0.1.0 Release

**Files:**
- External: GitHub Pull Request
- External: GitHub Actions
- External: Git tag `v0.1.0`
- External: GitHub Release `v0.1.0`

- [ ] **Step 1: GitHub認証とbranch状態を確認する**

Run: `gh auth status && git status -sb && git log --oneline origin/main..HEAD`

Expected: GitHub account `yuuki`でauthenticated。worktree clean。実装commit一覧が表示される。

認証が無効なら、利用者へ`gh auth login -h github.com`を依頼し、成功するまでpushへ進まない。

- [ ] **Step 2: 最終検証をfreshに実行する**

Run: `npm ci && npm run check && git diff --exit-code -- main.js && git diff --check && git status --short`

Expected: install成功。all tests passed。型エラーなし。build成功。bundle差分なし。worktree clean。

- [ ] **Step 3: branchをpushする**

Run: `git push -u origin codex/full-redesign`

Expected: remote tracking branchが作成される。

- [ ] **Step 4: ready Pull Requestを作成する**

PR titleは`Redesign safe Confluence publishing`とする。

PR bodyには、root cause、五Topicの変更、旧形式移行、security behavior、test command、reviewer ACCEPT結果を記載する。

Run: `gh pr create --base main --head codex/full-redesign --title "Redesign safe Confluence publishing" --body-file /tmp/obsidian-confluence-publisher-pr.md`

Expected: draftではないPull Request URLが返る。

- [ ] **Step 5: CIを監視し、失敗を原因別に修正する**

Run: `gh pr checks --watch --fail-fast`

Expected: required checksがすべてpass。

失敗した場合は`gh pr checks`と`gh run view <run-id> --log-failed`で一次原因を特定する。

修正は失敗するlocal reproduction、最小修正、該当Topic reviewer再ACCEPT、`npm run check`、commit、pushの順に行う。

- [ ] **Step 6: squash mergeする**

Run: `gh pr merge --squash --delete-branch`

Expected: Pull RequestがMERGEDになり、remote feature branchが削除される。

- [ ] **Step 7: mainを更新してtagを作成する**

root worktreeを`main`へ戻して最新を取得する。

Run: `git switch main && git pull --ff-only origin main && git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0`

Expected: annotated tagがpushされ、Release workflowが開始する。

- [ ] **Step 8: Release workflowとassetsを確認する**

Run: `gh run list --workflow Release --limit 1 && gh run watch <run-id> --exit-status && gh release view v0.1.0 --json tagName,isDraft,isPrerelease,assets,url`

Expected: workflow success。releaseはdraftでもprereleaseでもない。assetsに`main.js`と`manifest.json`がある。

- [ ] **Step 9: merge後のmain CIを確認する**

Run: `gh run list --workflow CI --branch main --limit 1 && gh run watch <run-id> --exit-status`

Expected: main CI success。
