# Tailwind CSS + shadcn Component Gotchas

## Card Component Has `flex flex-col` Base

The `Card` component ships with `flex flex-col gap-4 py-4` as base classes. When you pass `className`, `tailwind-merge` only overrides conflicting utilities.

### Problem

```tsx
// BROKEN — flex-col is NOT overridden by flex (they're different properties)
<Card className="flex items-center gap-5 p-5">
```

Result: vertical layout (flex-col stays), not horizontal.

### Fix

```tsx
// Correct — explicitly set flex-row to override flex-col
<Card className="flex-row items-center gap-5 p-5">
```

### When Using Card as a Wrapper (no Card padding/gap needed)

```tsx
// Reset Card's default gap and padding
<Card className="gap-0 py-0 overflow-hidden">
```

## General Rule: Always Check Base Classes

Before passing layout-related `className` to ANY shadcn component, read its source in `components/ui/` to see what base classes it ships with. Common traps:

- `Card` → `flex flex-col gap-4 py-4`
- `CardHeader` → `grid auto-rows-min`
- `CardFooter` → `flex items-center border-t bg-muted/50 p-4`

`tailwind-merge` resolves conflicts by CSS property, NOT by logical intent. `flex` (display) and `flex-col` (direction) are different properties — both survive.

## Prefer utility classes over arbitrary values

> Tailwind v4 color/theme setup (oklch, `@theme inline`, `@custom-variant dark`) lives in `frontend-design-tokens.md`.

v4 expanded the spacing scale — every multiple of 4px now has a utility class. Use it instead of arbitrary values:

```tsx
// Wrong — arbitrary value for a standard spacing multiple
<div className="min-w-[220px] h-[160px] gap-[32px]">

// Correct — use the spacing scale (value * 4px)
<div className="min-w-55 h-40 gap-8">
```

Only use `[value]` syntax when the value is NOT a multiple of 4px (e.g. `w-[217px]`, `top-[3px]`).

## Buttons have NO `cursor: pointer` by default

Tailwind v4's Preflight dropped the v3 default that set `cursor: pointer` on buttons — they now follow the browser default (`cursor: default`). This affects EVERY button and `[role="button"]` in the app, not the one you happened to notice.

### Wrong

```tsx
// Per-button patch — forgotten on the next button, drifts immediately
<Button className="cursor-pointer">Add to sprint</Button>
```

### Fix — one global rule in `globals.css` base layer

```css
@layer base {
  /* Tailwind v4 dropped Preflight's default cursor:pointer on buttons; restore it. */
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

`:not(:disabled)` keeps disabled controls on the default cursor. `[role="button"]` covers interactive `<div>`/`<span>` elements (see `frontend-component-patterns.md`), not just native `<button>`.
