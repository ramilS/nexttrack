# NextTrack Web

Next.js 16 frontend for the NextTrack issue tracker. Built with React 19, TailwindCSS v4, shadcn/ui (base-nova), and TanStack Query.

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm 9+
- Running API server (`apps/api`) or set `NEXT_PUBLIC_API_URL`

### Development

```bash
# From monorepo root
pnpm dev            # starts both API and Web in parallel

# Or standalone
cd apps/web
pnpm dev            # http://localhost:3000
```

### Build

```bash
pnpm build          # Next.js production build (standalone output)
```

### Environment Variables

| Variable               | Default                        | Description               |
|------------------------|--------------------------------|---------------------------|
| `NEXT_PUBLIC_API_URL`  | `/api` (proxied via rewrites)  | API base URL              |
| `PORT`                 | `3000`                         | Dev/start server port     |

The `/api/*` path is proxied to the NestJS API via `next.config.ts` rewrites.

## Testing

### Unit Tests (Vitest)

```bash
cd apps/web
pnpm test               # run all unit tests
pnpm test -- --watch    # watch mode
```

### E2E Tests (Playwright)

Browser E2E tests live in `apps/e2e/` and cover critical user flows. See [`apps/e2e/README.md`](../e2e/README.md) for full details.

```bash
# From monorepo root
pnpm build                                    # build both apps first
cd apps/e2e
pnpm exec playwright install chromium         # first time only
pnpm test:e2e                                 # run all E2E tests
pnpm test:e2e:ui                              # interactive UI mode
pnpm test:e2e:headed                          # visible browser
```

E2E tests use Testcontainers (PostgreSQL + Redis) — Docker must be running.

## Project Structure

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, invite acceptance
│   ├── (main)/             # Protected routes (AppShell)
│   │   ├── dashboard/
│   │   ├── my-issues/
│   │   ├── projects/[key]/ # Project pages (issues, board, backlog, gantt, KB)
│   │   ├── profile/
│   │   ├── search/
│   │   └── admin/
│   └── (sso)/              # SSO callback
├── components/
│   ├── ui/                 # shadcn/ui (base-nova) primitives
│   ├── shared/             # Reusable components (StatusBadge, PriorityBadge, etc.)
│   ├── layout/             # Sidebar, Header, AppShell
│   ├── issues/             # Issue list, detail, create
│   ├── boards/             # Kanban board, cards, columns
│   ├── comments/           # Comment list, editor
│   └── ...
├── lib/
│   ├── api/                # API client functions (axios)
│   ├── hooks/              # React Query hooks
│   ├── stores/             # Zustand stores
│   └── utils.ts            # Utility functions
└── next.config.ts
```

## Key Architecture Decisions

- **shadcn/ui with base-nova** (NOT Radix) — uses `@base-ui/react` primitives. Use `render` prop instead of `asChild`.
- **TailwindCSS v4** — oklch color system, `@theme inline` for design tokens, `@custom-variant dark`.
- **API proxy** — Next.js rewrites `/api/*` to the NestJS backend. No CORS issues in development.
- **Auth flow** — access token in localStorage + httpOnly refresh_token cookie.

## `data-testid` Attributes

Key UI elements have `data-testid` for E2E test stability:

- `issue-row`, `issue-title`, `issue-title-input`
- `issue-status`, `issue-priority`
- `board-column`, `board-card`
- `login-form`

When adding interactive elements, include `data-testid` for E2E discoverability.
