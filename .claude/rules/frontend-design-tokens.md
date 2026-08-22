# Design Tokens and Color System

## Always Use Semantic Tokens

Never hardcode raw colors. Use the semantic tokens defined in `globals.css` and exposed via `@theme inline`.

### Status Colors

Use `bg-status-*` / `text-status-*` classes:
- `status-backlog`, `status-todo`, `status-in-progress`, `status-in-review`, `status-done`, `status-cancelled`

### Priority Colors

Use `text-priority-*` / `bg-priority-*` / `border-l-[var(--priority-*)]` classes:
- `priority-urgent`, `priority-high`, `priority-medium`, `priority-low`, `priority-none`

### Tag Colors

Tags use Tailwind's built-in palette with light/dark variants:
```
red, orange, yellow, green, blue, violet, purple, pink, gray
```
Pattern: `bg-{color}-100 dark:bg-{color}-950/40 text-{color}-700 dark:text-{color}-400`

## Dark/Light Theme

- Both schemes are defined in `globals.css` using oklch
- Dark mode: `.dark` class on `<html>`, toggled by `next-themes`
- Custom variant: `@custom-variant dark (&:is(.dark *))` — use `dark:` prefix in Tailwind classes
- Every custom color MUST have both light and dark values

## Adding New Tokens

1. Define CSS variable in `:root` AND `.dark` blocks in `globals.css`
2. Expose to Tailwind in `@theme inline` block as `--color-{name}: var(--{name})`
3. Use via Tailwind classes: `bg-{name}`, `text-{name}`, `border-{name}`
