# Dialog & Form Interaction

## Standard Dialog Flow

```typescript
// 1. Open dialog
await page.getByRole('button', { name: /Create Issue/i }).click();

// 2. Assert dialog is visible
await expect(page.getByRole('dialog')).toBeVisible();

// 3. Scope interactions to dialog
const dialog = page.getByRole('dialog');

// 4. Fill form fields
await dialog.getByLabel(/Title/i).fill('New Issue Title');
await dialog.getByLabel(/Description/i).fill('Issue description');

// 5. Submit
await dialog.getByRole('button', { name: /Create/i }).click();

// 6. Assert dialog closed (confirms success)
await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

// 7. Assert result in the page
await expect(page.getByText('New Issue Title')).toBeVisible();
```

## Key Rules

### Always scope to dialog

```typescript
// Wrong — might interact with elements behind the dialog
await page.getByLabel('Name').fill('test');

// Correct — scoped to dialog
const dialog = page.getByRole('dialog');
await dialog.getByLabel('Name').fill('test');
```

### Assert dialog visibility before interacting

```typescript
// Wrong — race condition if dialog hasn't opened yet
await page.getByRole('dialog').getByLabel('Name').fill('test');

// Correct — wait for dialog first
await expect(page.getByRole('dialog')).toBeVisible();
const dialog = page.getByRole('dialog');
await dialog.getByLabel('Name').fill('test');
```

### Assert dialog closed after submission

```typescript
// The dialog closing confirms the mutation succeeded
await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
```

## Form Patterns

### Text inputs

```typescript
await dialog.getByLabel(/Name/i).fill('Project Name');
await dialog.getByLabel(/Email/i).fill('user@example.com');
```

### Select / Dropdown (base-ui)

```typescript
// Open select
await dialog.getByLabel(/Priority/i).click();
// Select option
await page.getByRole('option', { name: 'High' }).click();
```

### Rich text (Tiptap)

```typescript
const editor = dialog.locator('.tiptap');
await editor.click();
await editor.fill('Rich text content');
// or for complex content:
await editor.pressSequentially('Type slowly for Tiptap');
```

### Checkbox

```typescript
await dialog.getByLabel(/Private project/i).check();
await dialog.getByLabel(/Archived/i).uncheck();
```

### Form with validation errors

```typescript
// Submit empty form to trigger validation
await dialog.getByRole('button', { name: /Create/i }).click();

// Assert validation message
await expect(dialog.getByText(/required/i)).toBeVisible();

// Dialog should still be open
await expect(dialog).toBeVisible();
```

## Encapsulate in Page Objects

Complex form interactions should live in Page Object methods:

```typescript
// In Page Object
async fillCreateForm(data: { name: string; key?: string; description?: string }) {
  const dialog = this.page.getByRole('dialog');
  await dialog.getByLabel(/Name/i).fill(data.name);
  if (data.key) {
    await dialog.getByLabel(/Key/i).fill(data.key);
  }
  if (data.description) {
    await dialog.getByLabel(/Description/i).fill(data.description);
  }
  await dialog.getByRole('button', { name: /Create/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

// In test
await projectsPage.fillCreateForm({ name: 'New Project', key: 'NP' });
```
