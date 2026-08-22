# Data Lists and Issue Rows

## Use CSS Grid for Aligned Column Layouts

Issue lists, table-like rows, and any repeating data rows MUST use CSS Grid, not flexbox. Grid ensures column alignment across all rows.

### Pattern

```tsx
<div className={cn(
  'group grid items-center border-b border-border last:border-b-0 px-4 py-2.5',
  'grid-cols-[16px_20px_18px_auto_1fr_auto_auto_28px_64px]',
  'gap-x-2.5',
)}>
```

### Rules

- Use `auto` for content-sized columns (issue keys, status badges) — not fixed widths
- Use `1fr` for the title/primary content column that should fill remaining space
- Use fixed small widths only for icons/checkboxes (`16px`, `20px`)
- Add `last:border-b-0` when rows are inside a Card to avoid double borders
- Keep `gap-x` tight (2–3) for compact look, use padding on container for outer spacing

## Tags Must Use Their Color

Never render tags as plain gray pills when color data is available. Use `TagBadge` component with color mapping for light/dark themes.

```tsx
// Wrong — ignores tag.color
<span className="bg-muted text-muted-foreground">{tag.name}</span>

// Correct — uses TagBadge with color support
<TagBadge name={tag.name} color={tag.color} />
```

## Compact Row Sizing

For YouTrack/Linear-style density:
- Row padding: `py-2.5` (not py-3 or py-4)
- Icons: `size-3.5` to `size-4`
- Avatars in rows: `size-6` (not size-7 or larger)
- Font: `text-sm` for titles, `text-xs` for metadata
- Gap between columns: `gap-x-2.5`
