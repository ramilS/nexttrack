# NextTrack Landing Page — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Goal:** A modern, Linear-quality landing page for GitHub Pages that showcases NextTrack as an open-source, self-hosted issue tracker — with live micro-interactive demos of its key differentiators.

## Purpose & Audience

Mix of open-source showcase and product-style selling:

- **Audience:** developers evaluating a self-hosted YouTrack/Jira alternative.
- **Primary CTAs:** "Star on GitHub" and "Self-host in 5 minutes".
- **Language:** English only.
- **Tone:** Linear-style product landing — dark, fast, confident; demos instead of promises.

## Approach (decided)

**Astro 5 + Tailwind CSS 4, React 19 islands for interactive demos**, living at `apps/landing` in the monorepo, deployed to GitHub Pages via a dedicated workflow.

Rejected alternatives:
- *Vite + React SPA* — fully client-rendered: worse SEO/social previews, heavier first paint.
- *Next.js static export* — base-path friction on Pages, heavyweight runtime for a single page.

Why Astro: static HTML with near-zero JS by default; each demo is an isolated React island hydrated lazily (`client:visible`), so Lighthouse stays excellent — speed *is* the sales pitch.

## Page Structure (top to bottom)

1. **Nav** — logo, anchor links (Features · Query Language · Self-host), "★ Star on GitHub" button with live star count (client-side fetch of the GitHub REST API; graceful fallback to no count on failure/rate-limit).
2. **Hero** — headline (working copy: "The open-source issue tracker that keeps up with you"), subline (YouTrack-style, self-hosted, MIT), CTAs: `Star on GitHub` + `Self-host in 5 min` (scrolls to terminal section). Below: real product screenshot from `.github/screenshots/` in a browser-chrome frame with a glow effect. Subtle hint: "Press ⌘K anywhere".
3. **Credibility strip** — engineering numbers instead of social proof: `1800+ tests · 30+ modules · MIT licensed · Self-hosted`.
4. **Demo 1: Query Language playground** (React island, `client:visible`).
5. **Demo 2: Command palette** — explainer section; the palette itself is global (`client:load`, ⌘K/Ctrl+K works anywhere on the page).
6. **Demo 3: Kanban board + real-time** (React island, `client:visible`).
7. **Bento feature grid** (~10 static cards): Sprints, Time tracking, Gantt, Dashboards, Knowledge base, Custom fields & workflows, Workflow automation, AI-assisted docs, Notifications (email / Telegram / webhooks), SSO (Google/Microsoft).
8. **Tech stack strip** — badges/logos: NestJS, Next.js, PostgreSQL, Elasticsearch, Valkey, MinIO, Socket.IO, BullMQ.
9. **Self-host terminal** — styled terminal window with the quick-start (`git clone` → `docker compose up -d` → `pnpm dev`), copy buttons, typing animation.
10. **Footer** — MIT license, GitHub / README links.

## Visual Direction

- Dark theme as the primary (and only) scheme, oklch palette in the spirit of the product app.
- One accent: indigo/violet gradient.
- Typography: Inter (or Geist), tight tracking on headings.
- Subtle grid pattern in the hero background; soft glows behind demo frames.
- Scroll-reveal animations via IntersectionObserver + CSS transitions — **no animation libraries**.
- `prefers-reduced-motion` respected: reveals and autoplay animations degrade to static.

## Interactive Demos

### Demo 1 — Query Language Playground

- Input with token-level syntax highlighting (`field:` in one color, values in another, `sort by:` recognized).
- Clickable preset chips: e.g. "my urgent bugs", "unresolved this sprint", "recently updated".
- A dropdown hint listing available fields (static list for the demo).
- Below: a mock issue list (~12 issues) filtered live as the user types.
- **Uses the real parser.** The query-language core (`lexer.ts`, `parser.ts`, `ast.types.ts`) is pure dependency-free TypeScript currently in `apps/api/src/modules/search/query-language/`. As part of this work it moves to `packages/shared/src/query-language/` (re-exported from the barrel); the API updates its imports. `autocomplete.service.ts` stays in the API (it depends on Nest/Prisma). The landing imports the parser from `@repo/shared` and evaluates the resulting AST against the mock issues with a small demo evaluator.
- Parse errors render as a gentle inline hint, never a broken UI.

### Demo 2 — Command Palette

- Global: ⌘K / Ctrl+K opens it anywhere on the landing; also openable from a visible button in the explainer section.
- Fuzzy search over commands: jump to page sections, "Copy git clone command", "Open GitHub repo", "Star on GitHub".
- Keyboard navigation (arrows + Enter + Esc), focus trap, accessible roles.
- Selling point: the site about the tracker behaves like the tracker.

### Demo 3 — Kanban Board + Real-time

- Mini board: 3 columns (To Do / In Progress / Done), 5–6 cards with priority color bars (matching product styling).
- On entering the viewport: an autoplay loop — a fake collaborator cursor (with avatar) picks a card, drags it to Done, a live toast appears ("Alex moved NT-42 to Done"), pause, reset, repeat.
- The visitor can also drag cards themselves (pointer-based, simple — no dnd library).
- Autoplay pauses while the user interacts; disabled entirely under `prefers-reduced-motion`.

## Architecture

```
apps/landing/
├── astro.config.mjs        # base: '/nexttrack/', site: https://ramils.github.io
├── src/
│   ├── pages/index.astro   # page shell, all static sections
│   ├── components/         # Astro components: Nav, Hero, Bento, Terminal, Footer…
│   ├── islands/            # React: QueryPlayground, CommandPalette, BoardDemo
│   ├── lib/mock-data.ts    # shared mock issues + demo evaluator
│   └── styles/             # Tailwind 4 theme (oklch tokens)
```

- Mock data is one shared module used by all three demos (consistent issue keys/names).
- The demo AST evaluator (AST → predicate over mock issues) lives in `apps/landing/src/lib/` — it is demo-only and does not belong in shared.
- OG meta + generated og-image for social previews.

## Deployment

- New workflow `.github/workflows/pages.yml`: on push to the default branch → `pnpm --filter landing build` → upload `apps/landing/dist` → `actions/deploy-pages`.
- Astro `base` set for project pages (`https://ramils.github.io/nexttrack/`); all asset/anchor URLs must respect it.
- GitHub Pages must be set to "GitHub Actions" source in repo settings (manual one-time step, documented in the PR).

## Testing

Proportional to a static landing:

- **Vitest unit tests** for the demo evaluator (AST → mock filtering) and the parser move (existing `parser.spec.ts` keeps passing from its new home in `packages/shared`).
- API full gate must stay green after the parser relocation (`cd apps/api && pnpm test`).
- Visual/interaction QA manually + Lighthouse pass (target: 95+ performance/a11y/SEO).

## Out of Scope

- RU localization / language switcher.
- Real backend calls (other than the public GitHub star-count fetch).
- Docs site / multiple pages — single landing page only.
- Light theme.
