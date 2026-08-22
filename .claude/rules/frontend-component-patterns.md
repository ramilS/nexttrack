# Frontend Component Patterns

## Design Reference: Linear x Notion x YouTrack

- **Linear**: compact keyboard-first navigation, clean sidebar, subtle animations
- **Notion**: spacious content/editor areas, warm tones
- **YouTrack**: CSS Grid issue rows with aligned columns, priority-colored card borders, dense data tables

## Client vs Server Components

- Layout components with interactivity (Sidebar, Header, ThemeSwitcher) → `'use client'`
- Page components with only static rendering → server component (no directive)
- Event handlers (`onClick`, `onChange`) ONLY work in client components
- If a page uses client-only components inline, either extract them or add `'use client'` to the page

## Shared Component Conventions

Shared UI components live in `components/shared/`. For the current inventory read
the barrel `components/shared/index.ts` — do NOT rely on a list duplicated here, it
drifts out of sync.

A component belongs in `shared/` when it has no feature-specific business logic and
is (or could be) reused across pages: badges, avatars, state wrappers, pickers,
inputs, layout primitives. **Before hand-rolling a one-off helper, grep
`components/shared/` first** — what you need (status/priority badge, loading/empty
wrapper, relative-time, confirm dialog) very likely already exists.

## Anti-Duplication Rules

### Never use browser `confirm()` — use `ConfirmDialog`

```tsx
// Wrong — breaks design system, not accessible, can't be styled
if (confirm('Are you sure?')) { ... }

// Correct — use shared ConfirmDialog component
<ConfirmDialog
  title="Delete issue"
  description="This action cannot be undone."
  variant="danger"
  onConfirm={handleDelete}
/>
```

### Never duplicate loading/empty patterns — use `AsyncContent`

`AsyncContent` (`components/shared/async-content.tsx`) centralizes the
loading → empty → content state machine. Read its source for the exact props — it
has a simple form and a `data` render-prop form.

```tsx
// Wrong — duplicated in 15+ list components
{isLoading ? <Loader2 className="animate-spin" /> : items.length === 0 ? <EmptyState /> : <List />}

// Correct — one wrapper owns all three states
<AsyncContent loading={isLoading} empty={items.length === 0} emptyState={<EmptyState />}>
  <List items={items} />
</AsyncContent>
```

### Never duplicate date formatting — use `RelativeTime`

```tsx
// Wrong — formatDistanceToNow duplicated in 3+ files
<span>{formatDistanceToNow(date, { addSuffix: true })}</span>

// Correct — shared component with tooltip for full date
<RelativeTime date={comment.createdAt} />
```

### Check `components/shared/` before creating inline helpers

Before writing a one-off helper component in a feature file, check if a shared component already exists or should be created. Signs you need a shared component:
- Same UI pattern appears in 2+ feature files
- Component has no feature-specific business logic
- Component could be useful in other pages

## Sizing Guidelines

| Element         | Compact (list rows) | Default (cards/forms) |
|-----------------|---------------------|-----------------------|
| Icons           | size-3.5 – size-4   | size-4 – size-5       |
| Avatars         | size-6              | size-8 – size-9       |
| Row padding     | py-2 – py-2.5      | py-3 – py-4           |
| Text (primary)  | text-sm             | text-sm – text-base   |
| Text (meta)     | text-xs             | text-xs – text-sm     |
| Gap             | gap-2 – gap-2.5     | gap-3 – gap-4         |

## Accessibility

Baseline a11y (Tab reachability, `aria-label` on icon buttons, `role`+`tabIndex`+handlers on interactive `<div>`/`<span>`, semantic elements over div soup, focus trap/Escape in overlays, color never the sole signal, 4.5:1 contrast) is covered by the `web-design-guidelines` skill. Project-specific points:

- **Reuse the shared badges** — `StatusBadge`/`PriorityBadge` already pair color with a text label + `aria-label`; never hand-roll a bare colored pill
- **Data lists**: arrow-key navigation between rows. **Sidebar**: keyboard-collapsible (Linear-style)
- **Test both light AND dark themes** — oklch tokens make contrast regressions easy to miss in one mode

### shadcn/base-ui Specifics

- base-ui components handle most ARIA automatically — don't duplicate (e.g., don't add `role="dialog"` to Dialog)
- Tooltip: always wrap non-interactive triggers in `<span>` with `tabIndex={0}` so keyboard users can trigger it
- DropdownMenu/Select: base-ui handles focus trap and arrow navigation — verify, don't reimplement

## AppShell Structure

```
AppShell (flex h-screen)
├── Sidebar (w-64 / w-14 collapsed, border-r)
└── Content (flex-1 flex-col)
    ├── Header (h-14, border-b, backdrop-blur)
    └── main (flex-1 overflow-y-auto)
        └── Page content (max-w-[1280px] mx-auto p-8)
```
