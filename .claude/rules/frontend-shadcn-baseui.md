# shadcn/ui (base-nova) — Base UI, NOT Radix

This project uses `shadcn` with the **base-nova** style, which is built on `@base-ui/react`, NOT `@radix-ui/react`. The APIs are fundamentally different.

## Key Differences from Radix-based shadcn

### No `asChild` — use `render` prop instead

```tsx
// Wrong — Radix API, does not exist in base-ui
<DropdownMenuTrigger asChild>
  <Button>Open</Button>
</DropdownMenuTrigger>

// Correct — base-ui uses render prop
<DropdownMenuTrigger render={<Button />}>
  Open
</DropdownMenuTrigger>
```

### No `delayDuration` on Tooltip — use `delay`

```tsx
// Wrong
<TooltipProvider delayDuration={0}>

// Correct
<TooltipProvider delay={0}>
```

### Tooltip structure

```tsx
<Tooltip>
  <TooltipTrigger render={<span />}>{content}</TooltipTrigger>
  <TooltipContent side="right" sideOffset={8}>
    Label text
  </TooltipContent>
</Tooltip>
```

### Select requires `label` on SelectItem

`SelectValue` in base-ui renders the `label` of the selected item, NOT its children. Without `label`, the raw `value` (e.g. a UUID) is displayed.

```tsx
// Wrong — UUID displayed as selected text
<SelectItem value={opt.id}>
  <TagBadge name={opt.name} />
</SelectItem>

// Correct — human-readable label displayed
<SelectItem value={opt.id} label={opt.name}>
  <TagBadge name={opt.name} />
</SelectItem>
```

### `label` alone is NOT enough — `<SelectValue />` needs `items` on the root

base-ui builds the `value → label` map from the `SelectItem`s that are **currently
mounted**. The popup mounts lazily (only on first open). So a `Select` with a
preset `value` and a bare `<SelectValue />` shows the **raw value** (UUID / enum)
until the user opens the dropdown once — after which the label sticks. Symptom:
"the trigger shows a UUID, but the dropdown shows the name."

Fix: pass `items` (value→label) to the `Select` root so `<SelectValue />` can
resolve the label without the popup being mounted.

```tsx
// Wrong — shows raw UUID until the dropdown is opened
<Select value={status.id}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  ...
</Select>

// Correct — items lets SelectValue resolve the label up-front
<Select items={statusOptions} value={status.id}>   {/* [{ value, label }] or Record<value,label> */}
  <SelectTrigger><SelectValue /></SelectTrigger>
  ...
</Select>
```

A **function child** is the alternative fix and overrides the auto-label entirely
(so `items` is moot when one is present) — but it must MAP the value, never return
it raw:

```tsx
// Wrong — returns the raw enum; trigger shows "CRITICAL", dropdown shows "Critical"
<SelectValue>{(v) => v ?? 'Select priority'}</SelectValue>

// Correct — map value → label
<SelectValue>
  {(v) => ISSUE_PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? 'Select priority'}
</SelectValue>
```

## Before Using Any shadcn Component

1. Read the actual component source in `components/ui/` — do NOT assume Radix API
2. Check which primitive it imports (`@base-ui/react/*`)
3. Match the props to the base-ui docs, not shadcn/radix docs
