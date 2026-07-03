# NextTrack Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-02-landing-page-design.md`

**Goal:** A Linear-quality, dark, single-page landing for GitHub Pages showcasing NextTrack, with three live demos (query-language playground on the real parser, global ⌘K command palette, kanban board with a real-time collaborator simulation).

**Architecture:** New `apps/landing` (Astro 5 static site, React 19 islands hydrated lazily, Tailwind CSS 4). The query-language core (lexer/parser/AST types) moves from `apps/api` to `packages/shared` so both the API and the landing consume it. Deploy via a dedicated GitHub Actions workflow to GitHub Pages.

**Tech Stack:** Astro 5, @astrojs/react, React 19, Tailwind CSS 4 (`@tailwindcss/vite`), @fontsource-variable/inter, vitest. No animation libraries, no UI kits.

## Global Constraints

- Package manager: **pnpm only** (never npm/yarn). Node >= 22.
- New workspace package name: `landing` (unscoped, matching `api`/`web`/`e2e`).
- GitHub repo: `https://github.com/ramilS/nexttrack`. Pages URL: `https://ramils.github.io/nexttrack/` → Astro `site: 'https://ramils.github.io'`, `base: '/nexttrack'`.
- All copy in English. Dark theme only. `prefers-reduced-motion` must disable autoplay/reveal animations.
- No external CDNs (fonts self-hosted via @fontsource). Only outbound request: GitHub REST API for the star count (graceful silent fallback — this is a deliberate, spec'd exception to the no-silent-catch rule).
- Immutable state updates, no `as any`, explicit types on exported functions (project TS style).
- Do NOT modify `apps/web`. In `apps/api` touch ONLY the import sites listed in Task 1.
- Every task ends with a commit on branch `feat/landing-page`.

## File Structure

```
packages/shared/src/query-language/     # moved from apps/api (Task 1)
  ast.types.ts  lexer.ts  parser.ts  index.ts  parser.test.ts
apps/landing/
  package.json  astro.config.mjs  tsconfig.json  vitest.config.ts
  public/favicon.svg  public/og.png
  src/assets/screenshot-issues.png
  src/styles/global.css                 # Tailwind 4 theme (oklch tokens)
  src/layouts/Layout.astro              # head/meta/OG, reveal script
  src/components/{Nav,Hero,Stats,PaletteHint,FeatureGrid,TechStack,Terminal,Footer}.astro
  src/islands/{QueryPlayground,CommandPalette,BoardDemo}.tsx
  src/lib/{mock-issues.ts,query-evaluator.ts,fuzzy.ts}  (+ .test.ts)
  src/pages/index.astro
.github/workflows/pages.yml
```

---

### Task 1: Move query-language core to `packages/shared`

**Files:**
- Create: `packages/shared/src/query-language/index.ts`
- Move: `apps/api/src/modules/search/query-language/{ast.types.ts,lexer.ts,parser.ts}` → `packages/shared/src/query-language/`
- Move+rename: `apps/api/src/modules/search/query-language/parser.spec.ts` → `packages/shared/src/query-language/parser.test.ts`
- Modify: `packages/shared/package.json` (exports), `apps/api/jest.config.ts` (moduleNameMapper), `apps/api/src/modules/search/search.service.ts:17-21`, `apps/api/src/modules/search/elasticsearch/es-query-builder.service.ts:9`, `apps/api/src/modules/search/elasticsearch/es-query-builder.service.spec.ts:5`

**Interfaces:**
- Produces: subpath import `@repo/shared/query-language` exporting `Lexer`, `Parser` (classes) and all AST types (`Token`, `TokenType`, `ParsedQuery`, `FieldFilterNode`, `TextSearchNode`, `HashtagNode`, `SortNode`, `FilterValue`, `FilterOperator`, `ParseError`, `QueryNode`). Usage: `new Parser(new Lexer(q).tokenize()).parse()` → `ParsedQuery`.
- `autocomplete.service.ts` + its spec stay in `apps/api` untouched (they don't import lexer/parser/ast.types).

- [ ] **Step 1: Move the files with git mv**

```bash
mkdir -p packages/shared/src/query-language
git mv apps/api/src/modules/search/query-language/ast.types.ts packages/shared/src/query-language/ast.types.ts
git mv apps/api/src/modules/search/query-language/lexer.ts packages/shared/src/query-language/lexer.ts
git mv apps/api/src/modules/search/query-language/parser.ts packages/shared/src/query-language/parser.ts
git mv apps/api/src/modules/search/query-language/parser.spec.ts packages/shared/src/query-language/parser.test.ts
```

- [ ] **Step 2: Create the barrel** `packages/shared/src/query-language/index.ts`

```typescript
export * from './ast.types';
export { Lexer } from './lexer';
export { Parser } from './parser';
```

- [ ] **Step 3: Convert the moved test to vitest**

In `packages/shared/src/query-language/parser.test.ts`, add as the FIRST line (jest used globals; shared uses explicit vitest imports — see `schemas/common.schema.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
```

The rest of the file (imports from `./lexer`, `./parser`, `./ast.types` and all test bodies) stays unchanged. Note: `tsconfig.build.json` already excludes `src/**/*.test.ts`, so the test won't be compiled into `dist`.

- [ ] **Step 4: Add the subpath export** in `packages/shared/package.json`, inside `"exports"`, after the `"./schemas/*"` entry:

```json
"./query-language": {
  "types": "./src/query-language/index.ts",
  "default": "./dist/query-language/index.js"
}
```

- [ ] **Step 5: Update API imports**

`apps/api/src/modules/search/search.service.ts` — replace lines 17-21:

```typescript
import { Lexer } from './query-language/lexer';
import { Parser } from './query-language/parser';
import type {
  ParsedQuery,
} from './query-language/ast.types';
```

with:

```typescript
import { Lexer, Parser } from '@repo/shared/query-language';
import type { ParsedQuery } from '@repo/shared/query-language';
```

`apps/api/src/modules/search/elasticsearch/es-query-builder.service.ts` and `es-query-builder.service.spec.ts` — in the import ending `} from '@/modules/search/query-language/ast.types';`, change the source to `'@repo/shared/query-language'` (keep the imported names as-is).

- [ ] **Step 6: Add the jest mapping** in `apps/api/jest.config.ts` `moduleNameMapper`, BEFORE the `'^@repo/shared$'` catch-all line:

```typescript
'^@repo/shared/query-language$':
  '<rootDir>/../../../packages/shared/src/query-language/index',
```

- [ ] **Step 7: Verify no stale references remain**

```bash
grep -rn "query-language/lexer\|query-language/parser\|query-language/ast.types" apps/ --include="*.ts" | grep -v "@repo/shared"
```

Expected: no output (autocomplete.service references only its own file).

- [ ] **Step 8: Run shared tests**

```bash
pnpm --filter @repo/shared test
```

Expected: PASS including the 5 relocated `query-language sort parsing` tests, plus clean check-types/lint.

- [ ] **Step 9: Run the API gate**

```bash
cd apps/api && pnpm test
```

Expected: check-types, lint, unit, integration all green (integration needs docker infra up — `cd infra && docker compose up -d postgres valkey minio elasticsearch` if not running).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor(shared): move query-language core to packages/shared"
```

---

### Task 2: Scaffold `apps/landing` (Astro 5 + React + Tailwind 4)

**Files:**
- Create: `apps/landing/package.json`, `apps/landing/astro.config.mjs`, `apps/landing/tsconfig.json`, `apps/landing/vitest.config.ts`, `apps/landing/src/styles/global.css`, `apps/landing/src/pages/index.astro`, `apps/landing/public/favicon.svg`, `apps/landing/.gitignore`

**Interfaces:**
- Produces: buildable Astro app; theme utility classes `bg-page`, `bg-panel`, `border-line`, `text-fg`, `text-fg-muted`, `text-accent`, `bg-accent`, `font-sans`, `font-mono` used by ALL later tasks; vite alias `@repo/shared/query-language` → shared **src** (build-order independent, mirrors the API's jest mapping).

- [ ] **Step 1: Create `apps/landing/package.json`**

```json
{
  "name": "landing",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check-types": "astro check",
    "test": "pnpm run check-types && pnpm run test:unit",
    "test:unit": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies** (resolves current minors; majors are what the plan's code targets)

```bash
cd apps/landing
pnpm add astro@^5 @astrojs/react@^4 react@^19 react-dom@^19 tailwindcss@^4 @tailwindcss/vite@^4 @fontsource-variable/inter@^5 "@repo/shared@workspace:*"
pnpm add -D typescript@5.9.2 @types/react@^19 @types/react-dom@^19 vitest@^4 @astrojs/check@^0.9
```

If a peer/version resolution fails, check the failing package's latest compatible major on npm and adjust — do not fall back to npm/yarn.

- [ ] **Step 3: Create `apps/landing/astro.config.mjs`**

```javascript
// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Alias to shared *source* so the landing never depends on packages/shared
// having been built first (same approach as apps/api's jest moduleNameMapper).
const sharedQueryLanguage = fileURLToPath(
  new URL('../../packages/shared/src/query-language/index.ts', import.meta.url),
);

export default defineConfig({
  site: 'https://ramils.github.io',
  base: '/nexttrack',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { '@repo/shared/query-language': sharedQueryLanguage },
    },
  },
});
```

- [ ] **Step 4: Create `apps/landing/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "paths": {
      "@repo/shared/query-language": ["../../packages/shared/src/query-language/index.ts"]
    }
  },
  "include": [".astro/types.d.ts", "src/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Create `apps/landing/vitest.config.ts`**

```typescript
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@repo/shared/query-language': fileURLToPath(
        new URL('../../packages/shared/src/query-language/index.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 6: Create `apps/landing/src/styles/global.css`**

```css
@import 'tailwindcss';
@import '@fontsource-variable/inter';

@theme {
  --color-page: oklch(0.14 0.012 285);
  --color-panel: oklch(0.18 0.014 285);
  --color-panel-hi: oklch(0.22 0.016 285);
  --color-line: oklch(0.28 0.015 285);
  --color-fg: oklch(0.93 0.006 285);
  --color-fg-muted: oklch(0.64 0.012 285);
  --color-accent: oklch(0.62 0.21 285);
  --color-accent-hi: oklch(0.74 0.18 300);
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 5rem;
}

body {
  background: var(--color-page);
  color: var(--color-fg);
}

@media (prefers-reduced-motion: no-preference) {
  [data-reveal] {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  [data-reveal].revealed {
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 7: Create `apps/landing/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="oklch(0.62 0.21 285)"/>
  <path d="M9 23V9h3.2l7.6 9.6V9H23v14h-3.2l-7.6-9.6V23H9z" fill="white"/>
</svg>
```

- [ ] **Step 8: Create placeholder `apps/landing/src/pages/index.astro`**

```astro
---
import '../styles/global.css';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NextTrack</title>
  </head>
  <body class="font-sans">
    <h1 class="text-accent p-8 text-3xl font-bold">NextTrack landing scaffold</h1>
  </body>
</html>
```

- [ ] **Step 9: Create `apps/landing/.gitignore`**

```
dist/
.astro/
```

- [ ] **Step 10: Install at root and build**

```bash
cd ../.. && pnpm install
pnpm turbo run build --filter=landing
```

Expected: build succeeds; `apps/landing/dist/index.html` exists and contains `NextTrack landing scaffold`. Also verify base path baked into asset URLs: `grep -o '/nexttrack/_astro' apps/landing/dist/index.html | head -1` → prints `/nexttrack/_astro`.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(landing): scaffold Astro 5 + React + Tailwind 4 app"
```

---

### Task 3: Mock data, query evaluator, fuzzy matcher (TDD)

**Files:**
- Create: `apps/landing/src/lib/mock-issues.ts`, `apps/landing/src/lib/query-evaluator.ts`, `apps/landing/src/lib/query-evaluator.test.ts`, `apps/landing/src/lib/fuzzy.ts`, `apps/landing/src/lib/fuzzy.test.ts`

**Interfaces:**
- Consumes: `Lexer`, `Parser`, `ParsedQuery`, `FieldFilterNode`, `FilterValue`, `QueryNode`, `SortNode` from `@repo/shared/query-language` (Task 1).
- Produces:
  - `MockIssue` interface `{ key: string; title: string; type: 'Bug'|'Feature'|'Task'|'Story'; status: 'To Do'|'In Progress'|'In Review'|'Done'; priority: 'Urgent'|'High'|'Medium'|'Low'; assignee: string | null; tags: string[]; createdDaysAgo: number; updatedDaysAgo: number }`
  - `MOCK_ISSUES: MockIssue[]` (12 items, keys NT-101…NT-112), `CURRENT_USER = 'alex'`, `BOARD_INITIAL_COLUMNS: Record<'To Do'|'In Progress'|'Done', string[]>`
  - `applyQuery(issues: MockIssue[], query: ParsedQuery): MockIssue[]`
  - `fuzzyScore(query: string, target: string): number | null` (null = no match, higher = better)

- [ ] **Step 1: Create `apps/landing/src/lib/mock-issues.ts`**

```typescript
export interface MockIssue {
  key: string;
  title: string;
  type: 'Bug' | 'Feature' | 'Task' | 'Story';
  status: 'To Do' | 'In Progress' | 'In Review' | 'Done';
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  assignee: string | null;
  tags: string[];
  createdDaysAgo: number;
  updatedDaysAgo: number;
}

export const CURRENT_USER = 'alex';

export const MOCK_ISSUES: MockIssue[] = [
  { key: 'NT-101', title: 'Fix N+1 query in board loading', type: 'Bug', status: 'In Progress', priority: 'High', assignee: 'alex', tags: ['backend'], createdDaysAgo: 2, updatedDaysAgo: 0 },
  { key: 'NT-102', title: 'Add keyboard shortcuts to issue list', type: 'Feature', status: 'To Do', priority: 'Medium', assignee: 'mira', tags: ['frontend'], createdDaysAgo: 5, updatedDaysAgo: 1 },
  { key: 'NT-103', title: 'Elasticsearch reindex drops custom fields', type: 'Bug', status: 'In Review', priority: 'Urgent', assignee: 'alex', tags: ['backend', 'search'], createdDaysAgo: 1, updatedDaysAgo: 0 },
  { key: 'NT-104', title: 'Update self-hosting guide', type: 'Task', status: 'To Do', priority: 'Low', assignee: null, tags: ['docs'], createdDaysAgo: 12, updatedDaysAgo: 4 },
  { key: 'NT-105', title: 'Redesign sprint planning view', type: 'Story', status: 'In Progress', priority: 'High', assignee: 'dana', tags: ['frontend'], createdDaysAgo: 7, updatedDaysAgo: 1 },
  { key: 'NT-106', title: 'Dark theme contrast on status badges', type: 'Bug', status: 'Done', priority: 'Medium', assignee: 'mira', tags: ['frontend'], createdDaysAgo: 9, updatedDaysAgo: 2 },
  { key: 'NT-107', title: 'Live cursors in issue editor', type: 'Feature', status: 'To Do', priority: 'Urgent', assignee: 'alex', tags: ['realtime'], createdDaysAgo: 3, updatedDaysAgo: 1 },
  { key: 'NT-108', title: 'Upgrade Postgres to 16', type: 'Task', status: 'Done', priority: 'Medium', assignee: 'dana', tags: ['infra'], createdDaysAgo: 20, updatedDaysAgo: 6 },
  { key: 'NT-109', title: 'Webhook retries duplicate deliveries', type: 'Bug', status: 'To Do', priority: 'High', assignee: null, tags: ['api'], createdDaysAgo: 4, updatedDaysAgo: 2 },
  { key: 'NT-110', title: 'Swimlane grouping by assignee', type: 'Feature', status: 'In Progress', priority: 'Low', assignee: 'mira', tags: ['boards'], createdDaysAgo: 6, updatedDaysAgo: 0 },
  { key: 'NT-111', title: 'Article version history', type: 'Story', status: 'In Review', priority: 'Medium', assignee: 'dana', tags: ['knowledge-base'], createdDaysAgo: 8, updatedDaysAgo: 3 },
  { key: 'NT-112', title: 'Refresh token race on multi-tab logout', type: 'Bug', status: 'In Progress', priority: 'Urgent', assignee: 'alex', tags: ['auth'], createdDaysAgo: 0, updatedDaysAgo: 0 },
];

export type BoardColumnName = 'To Do' | 'In Progress' | 'Done';

export const BOARD_INITIAL_COLUMNS: Record<BoardColumnName, string[]> = {
  'To Do': ['NT-102', 'NT-107', 'NT-104'],
  'In Progress': ['NT-101', 'NT-110'],
  Done: ['NT-106'],
};
```

- [ ] **Step 2: Write failing evaluator tests** — `apps/landing/src/lib/query-evaluator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer, Parser } from '@repo/shared/query-language';
import { MOCK_ISSUES } from './mock-issues';
import { applyQuery } from './query-evaluator';

function run(query: string): string[] {
  const parsed = new Parser(new Lexer(query).tokenize()).parse();
  expect(parsed.errors).toHaveLength(0);
  return applyQuery(MOCK_ISSUES, parsed).map((i) => i.key);
}

describe('applyQuery', () => {
  it('filters by quoted status value', () => {
    expect(run('status: "In Review"')).toEqual(['NT-103', 'NT-111']);
  });

  it('treats multiple comma values as IN', () => {
    expect(run('priority: Urgent, High')).toEqual([
      'NT-101', 'NT-103', 'NT-105', 'NT-107', 'NT-109', 'NT-112',
    ]);
  });

  it('resolves the "me" keyword to the demo current user', () => {
    expect(run('assignee: me')).toEqual(['NT-101', 'NT-103', 'NT-107', 'NT-112']);
  });

  it('supports quoted "{unassigned}" as IS_EMPTY', () => {
    // Verified against the real parser: the UNQUOTED form `assignee: {unassigned}`
    // is a parse error (the lexer reads {...} as a bracketed FIELD name) — the
    // keyword only works quoted. Do not "fix" this in the demo; it matches the product.
    expect(run('assignee: "{unassigned}"')).toEqual(['NT-104', 'NT-109']);
  });

  it('negates a value with a dash', () => {
    const keys = run('status: -Done');
    expect(keys).toHaveLength(10);
    expect(keys).not.toContain('NT-106');
    expect(keys).not.toContain('NT-108');
  });

  it('matches a hashtag against tags', () => {
    expect(run('#backend')).toEqual(['NT-101', 'NT-103']);
  });

  it('treats #unresolved as "not Done"', () => {
    const keys = run('#unresolved');
    expect(keys).toHaveLength(10);
    expect(keys).not.toContain('NT-106');
  });

  it('runs free text as a title substring search', () => {
    expect(run('reindex')).toEqual(['NT-103']);
  });

  it('combines filters with AND semantics', () => {
    expect(run('assignee: me priority: Urgent')).toEqual(['NT-103', 'NT-107', 'NT-112']);
  });

  it('sorts by created desc (newest first)', () => {
    expect(run('type: Bug sort by: created desc')).toEqual([
      'NT-112', 'NT-103', 'NT-101', 'NT-109', 'NT-106',
    ]);
  });

  it('sorts by priority desc (most severe first)', () => {
    expect(run('assignee: me sort by: priority desc')).toEqual([
      'NT-103', 'NT-107', 'NT-112', 'NT-101',
    ]);
  });

  it('field values match case-insensitively', () => {
    expect(run('priority: urgent')).toEqual(['NT-103', 'NT-107', 'NT-112']);
  });

  it('does not mutate the input array when sorting', () => {
    const before = [...MOCK_ISSUES];
    run('sort by: created desc');
    expect(MOCK_ISSUES).toEqual(before);
  });
});
```

Note on `priority desc` expectation: NT-103, NT-107, NT-112 are all Urgent — stable sort keeps their original array order.

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter landing test:unit
```

Expected: FAIL — `query-evaluator` module not found.

- [ ] **Step 4: Implement `apps/landing/src/lib/query-evaluator.ts`**

```typescript
import type {
  FieldFilterNode,
  FilterValue,
  ParsedQuery,
  QueryNode,
  SortNode,
} from '@repo/shared/query-language';
import { CURRENT_USER, type MockIssue } from './mock-issues';

const PRIORITY_RANK: Record<MockIssue['priority'], number> = {
  Urgent: 3,
  High: 2,
  Medium: 1,
  Low: 0,
};

function fieldValues(issue: MockIssue, field: string): string[] {
  switch (field.toLowerCase()) {
    case 'status':
    case 'state':
      return [issue.status];
    case 'priority':
      return [issue.priority];
    case 'type':
      return [issue.type];
    case 'assignee':
      return issue.assignee ? [issue.assignee] : [];
    case 'tag':
    case 'tags':
      return issue.tags;
    default:
      return [];
  }
}

function matchesValue(actual: string, value: FilterValue): boolean {
  const raw = value.isKeyword && value.raw.toLowerCase() === 'me' ? CURRENT_USER : value.raw;
  return actual.toLowerCase() === raw.toLowerCase();
}

function matchesFieldFilter(issue: MockIssue, node: FieldFilterNode): boolean {
  const actuals = fieldValues(issue, node.field);
  let result: boolean;
  switch (node.operator) {
    case 'IS_EMPTY':
      result = actuals.length === 0;
      break;
    case 'IS_NOT_EMPTY':
      result = actuals.length > 0;
      break;
    case 'RANGE':
      // Date/number ranges are out of scope for the demo dataset — pass-through.
      result = true;
      break;
    default:
      result = node.values.some((v) => actuals.some((a) => matchesValue(a, v)));
  }
  return node.negated ? !result : result;
}

function matchesNode(issue: MockIssue, node: QueryNode): boolean {
  switch (node.kind) {
    case 'FIELD_FILTER':
      return matchesFieldFilter(issue, node);
    case 'TEXT_SEARCH':
      return issue.title.toLowerCase().includes(node.text.toLowerCase());
    case 'HASHTAG':
      return node.name.toLowerCase() === 'unresolved'
        ? issue.status !== 'Done'
        : issue.tags.some((t) => t.toLowerCase() === node.name.toLowerCase());
  }
}

function comparableValue(issue: MockIssue, field: string): number | null {
  switch (field.toLowerCase()) {
    case 'created':
      return -issue.createdDaysAgo;
    case 'updated':
      return -issue.updatedDaysAgo;
    case 'priority':
      return PRIORITY_RANK[issue.priority];
    default:
      return null;
  }
}

function sortIssues(issues: MockIssue[], sort: SortNode): MockIssue[] {
  return [...issues].sort((a, b) => {
    for (const { field, direction } of sort.fields) {
      const av = comparableValue(a, field);
      const bv = comparableValue(b, field);
      if (av === null || bv === null || av === bv) continue;
      const diff = av < bv ? -1 : 1;
      return direction === 'asc' ? diff : -diff;
    }
    return 0;
  });
}

export function applyQuery(issues: MockIssue[], query: ParsedQuery): MockIssue[] {
  const filtered = issues.filter((issue) =>
    query.filters.every((node) => matchesNode(issue, node)),
  );
  return query.sort ? sortIssues(filtered, query.sort) : filtered;
}
```

- [ ] **Step 5: Run evaluator tests**

```bash
pnpm --filter landing test:unit
```

Expected: all `applyQuery` tests PASS. If an expectation disagrees with real parser output, fix the EVALUATOR (or a genuinely wrong expectation) — never patch the parser to satisfy the demo.

- [ ] **Step 6: Write failing fuzzy tests** — `apps/landing/src/lib/fuzzy.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null when characters are missing', () => {
    expect(fuzzyScore('xyz', 'Open GitHub repo')).toBeNull();
  });

  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('ogr', 'Open GitHub repo')).not.toBeNull();
  });

  it('returns 0 for an empty query (matches everything)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('ranks word-start matches above mid-word matches', () => {
    const wordStart = fuzzyScore('git', 'Copy git clone command');
    const midWord = fuzzyScore('git', 'digital');
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!).toBeGreaterThan(midWord!);
  });
});
```

- [ ] **Step 7: Run to verify FAIL, then implement `apps/landing/src/lib/fuzzy.ts`**

```typescript
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  let score = 0;
  let searchFrom = 0;
  let streak = 0;

  for (const ch of q) {
    const idx = t.indexOf(ch, searchFrom);
    if (idx === -1) return null;
    streak = idx === searchFrom && searchFrom > 0 ? streak + 1 : 1;
    const isWordStart = idx === 0 || t[idx - 1] === ' ';
    score += streak + (isWordStart ? 3 : 0);
    searchFrom = idx + 1;
  }
  return score;
}
```

- [ ] **Step 8: Run all landing tests**

```bash
pnpm --filter landing test:unit
```

Expected: PASS (evaluator + fuzzy).

- [ ] **Step 9: Commit**

```bash
git add apps/landing/src/lib && git commit -m "feat(landing): mock dataset, query evaluator and fuzzy matcher"
```

---

### Task 4: Layout, Nav, Hero, credibility strip

**Files:**
- Create: `apps/landing/src/layouts/Layout.astro`, `apps/landing/src/components/Nav.astro`, `apps/landing/src/components/Hero.astro`, `apps/landing/src/components/Stats.astro`
- Create: `apps/landing/src/assets/screenshot-issues.png` (copy), `apps/landing/public/og.png` (copy)
- Modify: `apps/landing/src/pages/index.astro`

**Interfaces:**
- Produces: `Layout.astro` with `Props { title: string; description: string }` wrapping `<slot />`; section anchor ids used by nav and palette: `#features`, `#query-language`, `#board`, `#self-host`. All later sections mount inside Layout.

- [ ] **Step 1: Copy the screenshot assets**

```bash
cp .github/screenshots/issues.png apps/landing/src/assets/screenshot-issues.png
cp .github/screenshots/issues.png apps/landing/public/og.png
```

- [ ] **Step 2: Create `apps/landing/src/layouts/Layout.astro`**

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
const base = import.meta.env.BASE_URL;
const ogImage = new URL(`${base.replace(/\/$/, '')}/og.png`, Astro.site);
const canonical = new URL(base, Astro.site);
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href={`${base.replace(/\/$/, '')}/favicon.svg`} />
    <link rel="canonical" href={canonical} />
    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={ogImage} />
    <meta property="og:url" content={canonical} />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body class="font-sans antialiased">
    <slot />
    <script>
      const revealed = document.querySelectorAll('[data-reveal]');
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15 },
      );
      revealed.forEach((el) => observer.observe(el));
    </script>
  </body>
</html>
```

- [ ] **Step 3: Create `apps/landing/src/components/Nav.astro`**

```astro
---
const repoUrl = 'https://github.com/ramilS/nexttrack';
---

<header class="border-line/60 bg-page/70 fixed inset-x-0 top-0 z-40 border-b backdrop-blur">
  <nav class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
    <a href="#top" class="text-lg font-bold tracking-tight">
      Next<span class="text-accent-hi">Track</span>
    </a>
    <div class="text-fg-muted hidden items-center gap-6 text-sm sm:flex">
      <a href="#features" class="hover:text-fg transition-colors">Features</a>
      <a href="#query-language" class="hover:text-fg transition-colors">Query language</a>
      <a href="#self-host" class="hover:text-fg transition-colors">Self-host</a>
    </div>
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener"
      class="border-line bg-panel hover:bg-panel-hi flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
    >
      <span aria-hidden="true">★</span> Star on GitHub
      <span id="gh-star-count" class="text-fg-muted tabular-nums"></span>
    </a>
  </nav>
</header>

<script>
  const el = document.getElementById('gh-star-count');
  if (el) {
    // Best-effort decoration: rate-limited/offline GitHub API must never break the page.
    fetch('https://api.github.com/repos/ramilS/nexttrack')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stargazers_count?: number } | null) => {
        if (typeof data?.stargazers_count === 'number') {
          el.textContent = String(data.stargazers_count);
        }
      })
      .catch(() => undefined);
  }
</script>
```

- [ ] **Step 4: Create `apps/landing/src/components/Hero.astro`**

```astro
---
import { Image } from 'astro:assets';
import screenshot from '../assets/screenshot-issues.png';

const repoUrl = 'https://github.com/ramilS/nexttrack';
---

<section id="top" class="relative overflow-hidden pt-32 pb-16">
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,oklch(0.3_0.02_285/0.25)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.3_0.02_285/0.25)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
  >
  </div>
  <div class="relative mx-auto max-w-6xl px-6 text-center">
    <p class="text-fg-muted border-line bg-panel mx-auto mb-6 w-fit rounded-full border px-3 py-1 text-xs">
      Open source · MIT · Self-hosted
    </p>
    <h1 class="mx-auto max-w-3xl text-5xl font-bold tracking-tight text-balance sm:text-6xl">
      The open-source issue tracker that keeps up with you
    </h1>
    <p class="text-fg-muted mx-auto mt-6 max-w-2xl text-lg text-pretty">
      YouTrack-grade queries, Linear-grade speed. Boards, sprints, docs and real-time
      collaboration — on your own infrastructure, with your data.
    </p>
    <div class="mt-8 flex items-center justify-center gap-4">
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener"
        class="bg-accent hover:bg-accent-hi rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
      >
        ★ Star on GitHub
      </a>
      <a
        href="#self-host"
        class="border-line bg-panel hover:bg-panel-hi rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
      >
        Self-host in 5 min
      </a>
    </div>
    <p class="text-fg-muted mt-6 text-xs">
      Press <kbd class="border-line bg-panel rounded border px-1.5 py-0.5 font-mono">⌘K</kbd>
      anywhere on this page
    </p>
    <div class="relative mx-auto mt-14 max-w-5xl" data-reveal>
      <div
        aria-hidden="true"
        class="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(ellipse_at_top,oklch(0.62_0.21_285/0.25),transparent_65%)] blur-2xl"
      >
      </div>
      <div class="border-line bg-panel relative overflow-hidden rounded-xl border shadow-2xl">
        <div class="border-line flex items-center gap-1.5 border-b px-4 py-2.5">
          <span class="size-2.5 rounded-full bg-rose-400/70"></span>
          <span class="size-2.5 rounded-full bg-amber-300/70"></span>
          <span class="size-2.5 rounded-full bg-emerald-400/70"></span>
        </div>
        <Image src={screenshot} alt="NextTrack issue list with query filtering" class="w-full" loading="eager" />
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 5: Create `apps/landing/src/components/Stats.astro`**

```astro
---
const stats = [
  { value: '1800+', label: 'automated tests' },
  { value: '30+', label: 'backend modules' },
  { value: 'MIT', label: 'licensed forever' },
  { value: '100%', label: 'your infrastructure' },
];
---

<section class="border-line border-y">
  <div class="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-[var(--color-line)] sm:grid-cols-4">
    {
      stats.map((stat) => (
        <div class="px-6 py-8 text-center">
          <div class="text-2xl font-bold tracking-tight">{stat.value}</div>
          <div class="text-fg-muted mt-1 text-sm">{stat.label}</div>
        </div>
      ))
    }
  </div>
</section>
```

- [ ] **Step 6: Rewrite `apps/landing/src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Nav from '../components/Nav.astro';
import Hero from '../components/Hero.astro';
import Stats from '../components/Stats.astro';
---

<Layout
  title="NextTrack — open-source issue tracker with a real query language"
  description="Self-hosted, MIT-licensed project tracker: YouTrack-style query language, agile boards, sprints, knowledge base and real-time collaboration."
>
  <Nav />
  <main>
    <Hero />
    <Stats />
  </main>
</Layout>
```

- [ ] **Step 7: Build and eyeball**

```bash
pnpm --filter landing build && pnpm --filter landing preview
```

Expected: build green; on `http://localhost:4321/nexttrack` the hero renders with grid background, glow, framed screenshot, working anchors. Stop preview afterwards.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(landing): layout, nav with live star count, hero, stats strip"
```

---

### Task 5: Query Language playground island

**Files:**
- Create: `apps/landing/src/islands/QueryPlayground.tsx`
- Modify: `apps/landing/src/pages/index.astro` (add section)

**Interfaces:**
- Consumes: `Lexer`, `Parser`, `Token`, `ParsedQuery` from `@repo/shared/query-language`; `MOCK_ISSUES`, `MockIssue` from `../lib/mock-issues`; `applyQuery` from `../lib/query-evaluator`.
- Produces: `<QueryPlayground />` React component (default export, no props).

- [ ] **Step 1: Create `apps/landing/src/islands/QueryPlayground.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react';
import { Lexer, Parser } from '@repo/shared/query-language';
import type { ParsedQuery, TokenType } from '@repo/shared/query-language';
import { MOCK_ISSUES, type MockIssue } from '../lib/mock-issues';
import { applyQuery } from '../lib/query-evaluator';

const TOKEN_CLASS: Partial<Record<TokenType, string>> = {
  FIELD: 'text-violet-400',
  SORT_BY: 'text-violet-400',
  COLON: 'text-zinc-500',
  COMMA: 'text-zinc-500',
  VALUE: 'text-emerald-300',
  QUOTED_VALUE: 'text-emerald-300',
  KEYWORD: 'text-sky-300',
  HASHTAG: 'text-amber-300',
  NEGATE: 'text-rose-400',
  RANGE_OP: 'text-zinc-500',
  FUZZY: 'text-emerald-300',
  TEXT: 'text-zinc-300',
};

const PRESETS = [
  { label: 'My urgent work', query: 'assignee: me priority: Urgent, High' },
  { label: 'Unresolved bugs, newest first', query: 'type: Bug #unresolved sort by: created desc' },
  { label: 'In review', query: 'status: "In Review" sort by: priority desc' },
  { label: 'Unassigned', query: 'assignee: "{unassigned}"' },
  { label: 'Not done', query: 'status: -Done' },
];

const FIELD_HINTS = ['status:', 'priority:', 'type:', 'assignee:', 'tag:', '#unresolved', 'sort by:'];

const PRIORITY_BAR: Record<MockIssue['priority'], string> = {
  Urgent: 'bg-rose-500',
  High: 'bg-orange-400',
  Medium: 'bg-amber-300',
  Low: 'bg-sky-400',
};

const STATUS_CLASS: Record<MockIssue['status'], string> = {
  'To Do': 'bg-zinc-500/20 text-zinc-300',
  'In Progress': 'bg-blue-500/20 text-blue-300',
  'In Review': 'bg-violet-500/20 text-violet-300',
  Done: 'bg-emerald-500/20 text-emerald-300',
};

interface Segment {
  text: string;
  className: string;
}

function highlightSegments(input: string): Segment[] {
  const tokens = new Lexer(input).tokenize().filter((t) => t.type !== 'EOF');
  if (tokens.length === 0) return [{ text: input, className: '' }];

  const segments: Segment[] = [];
  if (tokens[0].pos > 0) {
    segments.push({ text: input.slice(0, tokens[0].pos), className: '' });
  }
  tokens.forEach((token, i) => {
    const end = tokens[i + 1]?.pos ?? input.length;
    segments.push({
      text: input.slice(token.pos, end),
      className: TOKEN_CLASS[token.type] ?? 'text-zinc-300',
    });
  });
  return segments;
}

function parseQuery(input: string): ParsedQuery {
  return new Parser(new Lexer(input).tokenize()).parse();
}

export default function QueryPlayground() {
  const [query, setQuery] = useState(PRESETS[0].query);
  const highlightRef = useRef<HTMLPreElement>(null);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const results = useMemo(() => applyQuery(MOCK_ISSUES, parsed), [parsed]);
  const segments = useMemo(() => highlightSegments(query), [query]);
  const firstError = parsed.errors[0];

  const syncScroll = (target: HTMLInputElement) => {
    if (highlightRef.current) highlightRef.current.scrollLeft = target.scrollLeft;
  };

  return (
    <div className="border-line bg-panel overflow-hidden rounded-xl border shadow-2xl">
      <div className="border-line border-b p-4 sm:p-5">
        <div className="relative rounded-lg bg-black/30 font-mono text-sm">
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 whitespace-pre"
          >
            {segments.map((seg, i) => (
              <span key={i} className={seg.className}>
                {seg.text}
              </span>
            ))}
          </pre>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              syncScroll(e.target);
            }}
            onScroll={(e) => syncScroll(e.currentTarget)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Search query"
            placeholder="type a query, e.g. status: -Done sort by: priority desc"
            className="caret-fg placeholder:text-fg-muted/50 relative w-full bg-transparent px-4 py-3 whitespace-pre text-transparent outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setQuery(preset.query)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                query === preset.query
                  ? 'border-accent/60 bg-accent/15 text-accent-hi'
                  : 'border-line bg-panel-hi text-fg-muted hover:text-fg'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="text-fg-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>Fields:</span>
          {FIELD_HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setQuery((q) => (q.trim().length > 0 ? `${q.trim()} ${hint} ` : `${hint} `))}
              className="hover:text-fg font-mono transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
        {firstError && (
          <p className="mt-2 text-xs text-amber-300/90" role="status">
            {firstError.message} — showing best-effort results
          </p>
        )}
      </div>

      <div aria-live="polite">
        <p className="text-fg-muted px-5 pt-3 pb-1 text-xs">
          {results.length} of {MOCK_ISSUES.length} issues
        </p>
        <ul>
          {results.map((issue) => (
            <li
              key={issue.key}
              className="border-line/60 grid grid-cols-[4px_auto_1fr_auto] items-center gap-x-3 border-b px-5 py-2.5 text-sm last:border-b-0 sm:grid-cols-[4px_auto_1fr_auto_auto_auto]"
            >
              <span className={`h-4 w-1 rounded-full ${PRIORITY_BAR[issue.priority]}`} aria-hidden="true" />
              <span className="text-fg-muted font-mono text-xs">{issue.key}</span>
              <span className="truncate">{issue.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[issue.status]}`}>
                {issue.status}
              </span>
              <span className="text-fg-muted hidden text-xs sm:block">
                {issue.assignee ?? '—'}
              </span>
              <span className="text-fg-muted hidden font-mono text-xs sm:block">
                {issue.tags.map((t) => `#${t}`).join(' ')}
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="text-fg-muted px-5 py-8 text-center text-sm">
              No issues match this query — try one of the presets above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

Implementation notes (why, not what):
- The `<pre>`-under-transparent-`<input>` trick requires IDENTICAL font, padding and `whitespace-pre` on both layers, and scroll sync — that's what `syncScroll` is for.
- Highlighting slices the ORIGINAL input between token positions (never re-serializes token values), so quotes and whitespace always align.

- [ ] **Step 2: Add the section to `apps/landing/src/pages/index.astro`**

Add the import and, after `<Stats />`:

```astro
---
// add to frontmatter imports:
import QueryPlayground from '../islands/QueryPlayground';
---

<section id="query-language" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
  <p class="text-accent-hi text-sm font-semibold">Query language</p>
  <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
    Search the way you think
  </h2>
  <p class="text-fg-muted mt-4 max-w-2xl">
    A real query language — not a wall of filter dropdowns. Fields, negation,
    <code class="font-mono text-sm">me</code> and <code class="font-mono text-sm">{'{unassigned}'}</code> keywords,
    multi-value filters and <code class="font-mono text-sm">sort by:</code> — parsed by the exact same code
    that runs in the product. Try it:
  </p>
  <div class="mt-8">
    <QueryPlayground client:visible />
  </div>
</section>
```

- [ ] **Step 3: Type-check, test, build, eyeball**

```bash
pnpm --filter landing test && pnpm --filter landing build && pnpm --filter landing preview
```

Expected: green; in the browser typing `status: -Done` live-filters the list, tokens are colored, presets switch the query, caret/text alignment is pixel-exact (check by selecting text). Stop preview.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(landing): query language playground on the real parser"
```

---

### Task 6: Command palette island (global ⌘K)

**Files:**
- Create: `apps/landing/src/islands/CommandPalette.tsx`, `apps/landing/src/components/PaletteHint.astro`
- Modify: `apps/landing/src/pages/index.astro`

**Interfaces:**
- Consumes: `fuzzyScore` from `../lib/fuzzy`.
- Produces: `<CommandPalette />` (default export, no props) — self-contained overlay listening for `keydown` (⌘K/Ctrl+K) and the custom DOM event `nexttrack:open-palette` on `window`. `PaletteHint.astro` dispatches that event from a button.

- [ ] **Step 1: Create `apps/landing/src/islands/CommandPalette.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from '../lib/fuzzy';

const REPO_URL = 'https://github.com/ramilS/nexttrack';

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
}

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<Element | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'features', label: 'Go to Features', hint: 'Section', run: () => scrollToSection('features') },
      { id: 'query', label: 'Go to Query language', hint: 'Section', run: () => scrollToSection('query-language') },
      { id: 'board', label: 'Go to Board & real-time demo', hint: 'Section', run: () => scrollToSection('board') },
      { id: 'selfhost', label: 'Go to Self-host guide', hint: 'Section', run: () => scrollToSection('self-host') },
      {
        id: 'clone',
        label: 'Copy git clone command',
        hint: 'Clipboard',
        run: async () => {
          await navigator.clipboard.writeText(`git clone ${REPO_URL}.git`);
          setFeedback('Copied to clipboard');
        },
      },
      { id: 'github', label: 'Open GitHub repo', hint: 'Link', run: () => window.open(REPO_URL, '_blank', 'noopener') },
      { id: 'star', label: 'Star on GitHub', hint: 'Link', run: () => window.open(REPO_URL, '_blank', 'noopener') },
    ],
    [],
  );

  const matches = useMemo(() => {
    return commands
      .map((command) => ({ command, score: fuzzyScore(search, command.label) }))
      .filter((m): m is { command: Command; score: number } => m.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.command);
  }, [commands, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    const onOpenEvent = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('nexttrack:open-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('nexttrack:open-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement;
      setSearch('');
      setActiveIndex(0);
      setFeedback(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (previousFocus.current instanceof HTMLElement) {
      previousFocus.current.focus();
    }
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [search]);

  const runCommand = async (command: Command) => {
    await command.run();
    if (command.id === 'clone') {
      setTimeout(close, 700);
    } else {
      close();
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && matches[activeIndex]) {
      event.preventDefault();
      void runCommand(matches[activeIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[18vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="border-line bg-panel w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          className="border-line placeholder:text-fg-muted/60 w-full border-b bg-transparent px-4 py-3.5 text-sm outline-none"
        />
        <ul role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto py-2">
          {matches.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => void runCommand(command)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                  index === activeIndex ? 'bg-accent/15 text-fg' : 'text-fg-muted'
                }`}
              >
                <span>{command.label}</span>
                <span className="text-fg-muted text-xs">{command.hint}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-fg-muted px-4 py-6 text-center text-sm">No matching commands</li>
          )}
        </ul>
        <div className="border-line text-fg-muted flex items-center justify-between border-t px-4 py-2 text-xs">
          {feedback ?? (
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> run ·{' '}
              <kbd className="font-mono">esc</kbd> close
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/landing/src/components/PaletteHint.astro`**

```astro
<section id="features" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
  <p class="text-accent-hi text-sm font-semibold">Command palette</p>
  <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
    Everything is one keystroke away
  </h2>
  <p class="text-fg-muted mt-4 max-w-2xl">
    Create issues, jump to projects, change statuses, run searches — without leaving the
    keyboard. This very page runs one:
  </p>
  <button
    id="open-palette-btn"
    type="button"
    class="border-line bg-panel hover:bg-panel-hi mt-6 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors"
  >
    Try it now
    <span class="border-line bg-panel-hi rounded border px-1.5 py-0.5 font-mono text-xs">⌘K</span>
  </button>
</section>

<script>
  document.getElementById('open-palette-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new Event('nexttrack:open-palette'));
  });
</script>
```

- [ ] **Step 3: Wire into `apps/landing/src/pages/index.astro`**

Add imports and place `<PaletteHint />` after the query-language section; mount the palette once at the end of `<main>`:

```astro
import CommandPalette from '../islands/CommandPalette';
import PaletteHint from '../components/PaletteHint.astro';
```

```astro
<PaletteHint />
<CommandPalette client:load />
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter landing test && pnpm --filter landing build && pnpm --filter landing preview
```

Expected: ⌘K (or Ctrl+K) toggles the palette anywhere; typing filters fuzzily; arrows+Enter run commands; Esc and backdrop click close; "Copy git clone command" shows "Copied to clipboard"; the "Try it now" button opens it. Stop preview.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(landing): global command palette with fuzzy search"
```

---

### Task 7: Kanban board + real-time simulation island

**Files:**
- Create: `apps/landing/src/islands/BoardDemo.tsx`
- Modify: `apps/landing/src/pages/index.astro`

**Interfaces:**
- Consumes: `MOCK_ISSUES`, `BOARD_INITIAL_COLUMNS`, `BoardColumnName`, `MockIssue` from `../lib/mock-issues`.
- Produces: `<BoardDemo />` (default export, no props). Autoplay: fake collaborator cursor drags NT-101 from In Progress to Done + toast; loops until the visitor drags a card themselves; fully disabled under `prefers-reduced-motion`.

- [ ] **Step 1: Create `apps/landing/src/islands/BoardDemo.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  BOARD_INITIAL_COLUMNS,
  MOCK_ISSUES,
  type BoardColumnName,
  type MockIssue,
} from '../lib/mock-issues';

const COLUMN_ORDER: BoardColumnName[] = ['To Do', 'In Progress', 'Done'];
const AUTOPLAY_CARD = 'NT-101';
const AUTOPLAY_FROM: BoardColumnName = 'In Progress';
const AUTOPLAY_TO: BoardColumnName = 'Done';

const PRIORITY_BORDER: Record<MockIssue['priority'], string> = {
  Urgent: 'border-l-rose-500',
  High: 'border-l-orange-400',
  Medium: 'border-l-amber-300',
  Low: 'border-l-sky-400',
};

type Columns = Record<BoardColumnName, string[]>;

interface CursorState {
  x: number;
  y: number;
  pressed: boolean;
  visible: boolean;
}

interface UserDrag {
  key: string;
  from: BoardColumnName;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

const issueByKey = new Map(MOCK_ISSUES.map((issue) => [issue.key, issue]));

function moveCard(columns: Columns, key: string, from: BoardColumnName, to: BoardColumnName): Columns {
  if (from === to) return columns;
  return {
    ...columns,
    [from]: columns[from].filter((k) => k !== key),
    [to]: [...columns[to], key],
  };
}

function sleep(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms)).then(() => {
    if (signal.cancelled) throw new Error('cancelled');
  });
}

export default function BoardDemo() {
  const [columns, setColumns] = useState<Columns>(BOARD_INITIAL_COLUMNS);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, pressed: false, visible: false });
  const [ghostKey, setGhostKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userTookOver, setUserTookOver] = useState(false);
  const [drag, setDrag] = useState<UserDrag | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const columnRefs = useRef(new Map<BoardColumnName, HTMLDivElement>());
  const dragRef = useRef<UserDrag | null>(null);
  dragRef.current = drag;

  const relativeCenter = (el: Element) => {
    const container = containerRef.current!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left - container.left + rect.width / 2,
      y: rect.top - container.top + rect.height / 2,
    };
  };

  useEffect(() => {
    if (userTookOver) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const signal = { cancelled: false };

    const runLoop = async () => {
      // Initial delay lets the island settle after client:visible hydration.
      await sleep(1200, signal);
      for (;;) {
        const card = cardRefs.current.get(AUTOPLAY_CARD);
        const target = columnRefs.current.get(AUTOPLAY_TO);
        if (!card || !target || !containerRef.current) return;

        const start = relativeCenter(card);
        const end = relativeCenter(target);

        setCursor({ x: start.x + 120, y: start.y + 80, pressed: false, visible: true });
        await sleep(700, signal);
        setCursor({ x: start.x, y: start.y, pressed: false, visible: true });
        await sleep(800, signal);
        setCursor({ x: start.x, y: start.y, pressed: true, visible: true });
        setGhostKey(AUTOPLAY_CARD);
        await sleep(350, signal);
        setCursor({ x: end.x, y: end.y, pressed: true, visible: true });
        await sleep(950, signal);
        setGhostKey(null);
        setCursor({ x: end.x, y: end.y, pressed: false, visible: true });
        setColumns((cols) => moveCard(cols, AUTOPLAY_CARD, AUTOPLAY_FROM, AUTOPLAY_TO));
        setToast(`Alex moved ${AUTOPLAY_CARD} to ${AUTOPLAY_TO}`);
        await sleep(2400, signal);
        setToast(null);
        setCursor((c) => ({ ...c, visible: false }));
        await sleep(1600, signal);
        setColumns(BOARD_INITIAL_COLUMNS);
        await sleep(1400, signal);
      }
    };

    runLoop().catch(() => undefined); // 'cancelled' rejection is the intended exit path

    return () => {
      signal.cancelled = true;
    };
  }, [userTookOver]);

  const columnAtPoint = (clientX: number, clientY: number): BoardColumnName | null => {
    for (const [name, el] of columnRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return name;
      }
    }
    return null;
  };

  const onCardPointerDown = (event: React.PointerEvent, key: string, from: BoardColumnName) => {
    event.preventDefault();
    setUserTookOver(true);
    setGhostKey(null);
    setCursor((c) => ({ ...c, visible: false }));
    const container = containerRef.current!.getBoundingClientRect();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({
      key,
      from,
      x: event.clientX - container.left,
      y: event.clientY - container.top,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const container = containerRef.current!.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, x: event.clientX - container.left, y: event.clientY - container.top } : d));
    };
    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current) {
        const target = columnAtPoint(event.clientX, event.clientY);
        if (target) {
          setColumns((cols) => moveCard(cols, current.key, current.from, target));
          if (target !== current.from) setToast(`You moved ${current.key} to ${target}`);
          setTimeout(() => setToast(null), 2200);
        }
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag !== null]);

  const renderCard = (key: string, column: BoardColumnName, hidden: boolean) => {
    const issue = issueByKey.get(key);
    if (!issue) return null;
    return (
      <div
        key={key}
        ref={(el) => {
          if (el) cardRefs.current.set(key, el);
        }}
        onPointerDown={(event) => onCardPointerDown(event, key, column)}
        className={`border-line bg-panel-hi cursor-grab touch-none rounded-lg border border-l-2 p-3 select-none ${PRIORITY_BORDER[issue.priority]} ${hidden ? 'opacity-30' : ''}`}
      >
        <p className="text-fg-muted font-mono text-xs">{issue.key}</p>
        <p className="mt-1 text-sm leading-snug">{issue.title}</p>
      </div>
    );
  };

  const ghostIssue = ghostKey ? issueByKey.get(ghostKey) : null;
  const dragIssue = drag ? issueByKey.get(drag.key) : null;

  return (
    <div ref={containerRef} className="border-line bg-panel relative overflow-hidden rounded-xl border p-4 shadow-2xl">
      <div className="grid grid-cols-3 gap-3">
        {COLUMN_ORDER.map((name) => (
          <div
            key={name}
            ref={(el) => {
              if (el) columnRefs.current.set(name, el);
            }}
            className="rounded-lg bg-black/20 p-2.5"
          >
            <p className="text-fg-muted px-1 pb-2 text-xs font-semibold tracking-wide uppercase">
              {name} <span className="ml-1 font-normal">{columns[name].length}</span>
            </p>
            <div className="flex min-h-24 flex-col gap-2">
              {columns[name].map((key) =>
                renderCard(key, name, ghostKey === key || drag?.key === key),
              )}
            </div>
          </div>
        ))}
      </div>

      {ghostIssue && (
        <div
          aria-hidden="true"
          className={`border-line bg-panel-hi pointer-events-none absolute z-10 w-40 rotate-2 rounded-lg border border-l-2 p-3 shadow-xl transition-all duration-[950ms] ease-in-out ${PRIORITY_BORDER[ghostIssue.priority]}`}
          style={{ left: cursor.x - 80, top: cursor.y - 20 }}
        >
          <p className="text-fg-muted font-mono text-xs">{ghostIssue.key}</p>
          <p className="mt-1 text-sm leading-snug">{ghostIssue.title}</p>
        </div>
      )}

      {dragIssue && drag && (
        <div
          aria-hidden="true"
          className={`border-line bg-panel-hi pointer-events-none absolute z-10 w-40 rotate-2 rounded-lg border border-l-2 p-3 shadow-xl ${PRIORITY_BORDER[dragIssue.priority]}`}
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
        >
          <p className="text-fg-muted font-mono text-xs">{dragIssue.key}</p>
          <p className="mt-1 text-sm leading-snug">{dragIssue.title}</p>
        </div>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute z-20 transition-all duration-700 ease-in-out ${cursor.visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" className={cursor.pressed ? 'scale-90' : ''}>
          <path d="M5 3l14 8-6.5 1.5L9 19z" fill="oklch(0.74 0.18 300)" stroke="white" stroke-width="1.5" />
        </svg>
        <span className="bg-accent mt-0.5 ml-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white">
          Alex
        </span>
      </div>

      <div
        role="status"
        className={`border-line bg-panel-hi absolute right-4 bottom-4 z-20 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-xl transition-all duration-300 ${toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      >
        <span className="bg-accent flex size-6 items-center justify-center rounded-full text-xs font-bold text-white">
          A
        </span>
        {toast}
      </div>
    </div>
  );
}
```

Note: in React JSX the SVG attribute must be `strokeWidth` — if the linter/compiler flags `stroke-width`, use `strokeWidth={1.5}`.

- [ ] **Step 2: Add the section to `apps/landing/src/pages/index.astro`**

```astro
import BoardDemo from '../islands/BoardDemo';
```

```astro
<section id="board" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
  <p class="text-accent-hi text-sm font-semibold">Boards & real-time</p>
  <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
    See your team move, live
  </h2>
  <p class="text-fg-muted mt-4 max-w-2xl">
    Kanban boards with WIP limits, swimlanes and drag-and-drop — and every change lands on
    your teammates' screens instantly over WebSockets. Watch Alex work, or grab a card yourself:
  </p>
  <div class="mt-8">
    <BoardDemo client:visible />
  </div>
</section>
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter landing test && pnpm --filter landing build && pnpm --filter landing preview
```

Expected: scrolling to the section starts the loop (cursor flies in, drags NT-101 to Done, toast shows, board resets); dragging any card yourself moves it between columns, stops the autoplay for good, and shows a "You moved…" toast. With macOS "Reduce motion" enabled, no autoplay. Stop preview.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(landing): kanban demo with real-time collaborator simulation"
```

---

### Task 8: Feature bento grid, tech stack, terminal, footer

**Files:**
- Create: `apps/landing/src/components/FeatureGrid.astro`, `apps/landing/src/components/TechStack.astro`, `apps/landing/src/components/Terminal.astro`, `apps/landing/src/components/Footer.astro`
- Modify: `apps/landing/src/pages/index.astro`

**Interfaces:**
- Consumes: section anchor `#self-host` (Terminal) referenced by Hero CTA and palette.

- [ ] **Step 1: Create `apps/landing/src/components/FeatureGrid.astro`**

```astro
---
interface Feature {
  title: string;
  description: string;
  wide?: boolean;
}

const features: Feature[] = [
  { title: 'Sprints & backlog', description: 'Plan sprints, groom the backlog, track velocity — the full agile loop.', wide: true },
  { title: 'Custom fields & workflows', description: 'Per-project statuses, transitions and field schemas that match how you actually work.' },
  { title: 'Time tracking', description: 'Log work on issues and slice it into per-person, per-project reports.' },
  { title: 'Gantt timeline', description: 'Dependencies and scheduling on a zoomable timeline.' },
  { title: 'Dashboards', description: 'Composable widgets over live project data.' },
  { title: 'Knowledge base', description: 'A wiki with rich text, versions and issue links — docs live next to the work.' },
  { title: 'Workflow automation', description: 'Rules that assign, transition, tag and comment for you.', wide: true },
  { title: 'AI-assisted docs', description: 'Closing an issue can propose a documentation update — a human approves it in the tracker itself.' },
  { title: 'Notifications everywhere', description: 'In-app, email, Telegram and webhooks — with digests and dedup.' },
  { title: 'SSO & permissions', description: 'Google/Microsoft sign-in, invite-only registration, atomic per-project permissions.' },
];
---

<section class="mx-auto max-w-6xl px-6 py-24" data-reveal>
  <p class="text-accent-hi text-sm font-semibold">Everything else you'd expect</p>
  <h2 class="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
    A complete tracker, not a toy
  </h2>
  <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {
      features.map((feature) => (
        <div
          class:list={[
            'border-line bg-panel hover:bg-panel-hi group relative overflow-hidden rounded-xl border p-6 transition-colors',
            feature.wide && 'lg:col-span-2',
          ]}
        >
          <div
            aria-hidden="true"
            class="bg-accent/10 absolute -top-10 -right-10 size-32 rounded-full blur-2xl transition-opacity opacity-0 group-hover:opacity-100"
          />
          <h3 class="font-semibold">{feature.title}</h3>
          <p class="text-fg-muted mt-2 text-sm leading-relaxed">{feature.description}</p>
        </div>
      ))
    }
  </div>
</section>
```

- [ ] **Step 2: Create `apps/landing/src/components/TechStack.astro`**

```astro
---
const stack = [
  'NestJS 11', 'Next.js 16', 'React 19', 'PostgreSQL 16', 'Prisma 7',
  'Elasticsearch 9', 'Valkey 9', 'MinIO / S3', 'Socket.IO', 'BullMQ', 'Tailwind CSS 4',
];
---

<section class="border-line border-y">
  <div class="mx-auto max-w-6xl px-6 py-12">
    <p class="text-fg-muted text-center text-sm">Built on boring, battle-tested infrastructure</p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
      {
        stack.map((name) => (
          <span class="border-line bg-panel text-fg-muted rounded-full border px-3.5 py-1.5 font-mono text-xs">
            {name}
          </span>
        ))
      }
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create `apps/landing/src/components/Terminal.astro`**

```astro
---
const commands = [
  'git clone https://github.com/ramilS/nexttrack.git',
  'cd nexttrack/infra && docker compose up -d',
  'pnpm install && pnpm dev',
];
const allCommands = commands.join('\n');
---

<section id="self-host" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
  <p class="text-accent-hi text-sm font-semibold">Self-host</p>
  <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
    Your data. Your server. Five minutes.
  </h2>
  <p class="text-fg-muted mt-4 max-w-2xl">
    One compose file brings up Postgres, Valkey, Elasticsearch and MinIO. No usage tiers,
    no seat pricing, no data leaving your network.
  </p>
  <div class="border-line mt-8 overflow-hidden rounded-xl border bg-black/40 shadow-2xl">
    <div class="border-line flex items-center justify-between border-b px-4 py-2.5">
      <div class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full bg-rose-400/70"></span>
        <span class="size-2.5 rounded-full bg-amber-300/70"></span>
        <span class="size-2.5 rounded-full bg-emerald-400/70"></span>
      </div>
      <button
        id="copy-commands"
        type="button"
        data-commands={allCommands}
        class="text-fg-muted hover:text-fg text-xs transition-colors"
      >
        Copy
      </button>
    </div>
    <div class="p-5 font-mono text-sm leading-7">
      {
        commands.map((command) => (
          <p>
            <span class="text-accent-hi select-none">$ </span>
            <span class="text-fg">{command}</span>
          </p>
        ))
      }
      <p class="text-fg-muted mt-2">
        <span class="select-none"># </span>web on :3000 · api on :3001 — full guide in the README
      </p>
    </div>
  </div>
</section>

<script>
  const button = document.getElementById('copy-commands');
  button?.addEventListener('click', () => {
    const commands = button.getAttribute('data-commands') ?? '';
    navigator.clipboard.writeText(commands).then(
      () => {
        button.textContent = 'Copied!';
        setTimeout(() => (button.textContent = 'Copy'), 1500);
      },
      () => {
        button.textContent = 'Copy failed';
        setTimeout(() => (button.textContent = 'Copy'), 1500);
      },
    );
  });
</script>
```

- [ ] **Step 4: Create `apps/landing/src/components/Footer.astro`**

```astro
---
const repoUrl = 'https://github.com/ramilS/nexttrack';
---

<footer class="border-line border-t">
  <div class="text-fg-muted mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm sm:flex-row">
    <p>
      <span class="text-fg font-semibold">NextTrack</span> — MIT licensed, forever.
    </p>
    <div class="flex items-center gap-6">
      <a href={repoUrl} target="_blank" rel="noopener" class="hover:text-fg transition-colors">GitHub</a>
      <a href={`${repoUrl}#readme`} target="_blank" rel="noopener" class="hover:text-fg transition-colors">README</a>
      <a href={`${repoUrl}/blob/master/LICENSE`} target="_blank" rel="noopener" class="hover:text-fg transition-colors">License</a>
    </div>
  </div>
</footer>
```

- [ ] **Step 5: Assemble the final `apps/landing/src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Nav from '../components/Nav.astro';
import Hero from '../components/Hero.astro';
import Stats from '../components/Stats.astro';
import PaletteHint from '../components/PaletteHint.astro';
import FeatureGrid from '../components/FeatureGrid.astro';
import TechStack from '../components/TechStack.astro';
import Terminal from '../components/Terminal.astro';
import Footer from '../components/Footer.astro';
import QueryPlayground from '../islands/QueryPlayground';
import CommandPalette from '../islands/CommandPalette';
import BoardDemo from '../islands/BoardDemo';
---

<Layout
  title="NextTrack — open-source issue tracker with a real query language"
  description="Self-hosted, MIT-licensed project tracker: YouTrack-style query language, agile boards, sprints, knowledge base and real-time collaboration."
>
  <Nav />
  <main>
    <Hero />
    <Stats />

    <section id="query-language" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
      <p class="text-accent-hi text-sm font-semibold">Query language</p>
      <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        Search the way you think
      </h2>
      <p class="text-fg-muted mt-4 max-w-2xl">
        A real query language — not a wall of filter dropdowns. Fields, negation,
        <code class="font-mono text-sm">me</code> and <code class="font-mono text-sm">{'{unassigned}'}</code> keywords,
        multi-value filters and <code class="font-mono text-sm">sort by:</code> — parsed by the exact same code
        that runs in the product. Try it:
      </p>
      <div class="mt-8">
        <QueryPlayground client:visible />
      </div>
    </section>

    <PaletteHint />

    <section id="board" class="mx-auto max-w-5xl px-6 py-24" data-reveal>
      <p class="text-accent-hi text-sm font-semibold">Boards & real-time</p>
      <h2 class="mt-2 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        See your team move, live
      </h2>
      <p class="text-fg-muted mt-4 max-w-2xl">
        Kanban boards with WIP limits, swimlanes and drag-and-drop — and every change lands on
        your teammates' screens instantly over WebSockets. Watch Alex work, or grab a card yourself:
      </p>
      <div class="mt-8">
        <BoardDemo client:visible />
      </div>
    </section>

    <FeatureGrid />
    <TechStack />
    <Terminal />
  </main>
  <Footer />
  <CommandPalette client:load />
</Layout>
```

(If Tasks 5-7 already inserted their sections inline, this step consolidates — the final file must match the above.)

- [ ] **Step 6: Verify full page**

```bash
pnpm --filter landing test && pnpm --filter landing build && pnpm --filter landing preview
```

Expected: full page renders end-to-end; nav anchors, palette section jumps, terminal copy button, hover glows on bento cards all work. Stop preview.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(landing): bento feature grid, tech stack, self-host terminal, footer"
```

---

### Task 9: GitHub Pages workflow + docs

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md` (landing link), `CLAUDE.md` (monorepo layout line)

- [ ] **Step 1: Create `.github/workflows/pages.yml`**

```yaml
name: Deploy Landing to GitHub Pages

on:
  push:
    branches: [master]
    paths:
      - 'apps/landing/**'
      - 'packages/shared/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    name: Build landing
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ~/.local/share/pnpm/store
          key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-store-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test landing
        run: pnpm --filter landing test

      - name: Build landing
        run: pnpm turbo run build --filter=landing

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/landing/dist

  deploy:
    name: Deploy
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note: `upload-pages-artifact@v3` / `deploy-pages@v4` / `configure-pages@v5` are the latest majors known at plan time — if the run fails on a deprecated version, bump to the current major listed on the action's marketplace page (this is the one unverified external detail in this plan).

- [ ] **Step 2: Add the landing link to `README.md`**

Right after the badges block (after the `![License: MIT]` line), add:

```markdown
**[🌐 Live landing & interactive demos](https://ramils.github.io/nexttrack/)**
```

- [ ] **Step 3: Update `CLAUDE.md` Monorepo Layout**

Add after the `apps/e2e` line:

```markdown
- `apps/landing` — Astro 5 static landing for GitHub Pages (React islands for demos; deployed by `.github/workflows/pages.yml`; imports the query-language parser from `@repo/shared/query-language`)
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "ci: GitHub Pages deploy workflow for the landing + docs links"
```

---

### Task 10: Final gate, polish pass, PR

- [ ] **Step 1: Full verification**

```bash
pnpm --filter @repo/shared test
pnpm --filter landing test
pnpm turbo run build --filter=landing
cd apps/api && pnpm test && cd ../..
```

Expected: everything green.

- [ ] **Step 2: Lighthouse spot-check**

```bash
pnpm --filter landing preview
```

Open Chrome DevTools → Lighthouse → run on `http://localhost:4321/nexttrack` (Performance/Accessibility/SEO). Target ≥ 95 each. Fix regressions found (usually: missing alt text, contrast, unsized images). Stop preview.

- [ ] **Step 3: Fresh-context code review** (per `code-self-review.md`)

Dispatch a review subagent with ONLY the branch diff (`git diff master...HEAD`) and the project rules; act on CRITICAL/HIGH findings; re-run the gate if anything changed.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/landing-page
```

PR body must mention the manual one-time step: **repo Settings → Pages → Source: "GitHub Actions"** — without it the deploy job cannot publish.

---

## Post-merge manual checklist (not automatable)

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. After the first successful deploy, verify `https://ramils.github.io/nexttrack/` renders with assets (base-path check) and OG preview via a social-card debugger.
