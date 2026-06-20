import { test, expect } from '@playwright/test';
import { PROJECTS } from '@fixtures/test-data';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';

test.describe('Feature: Custom Fields', () => {
  test('custom fields settings page loads', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/settings/custom-fields`);
    await expect(page.getByRole('heading', { name: 'Custom Fields' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('seeded custom fields visible in settings', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/settings/custom-fields`);
    await expect(page.getByRole('heading', { name: 'Custom Fields' }).first()).toBeVisible({ timeout: 10_000 });

    // Seeded fields from seed-dev.ts
    await expect(page.getByText('Environment').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Story Points').first()).toBeVisible({ timeout: 5_000 });
  });

  test('create a text custom field via API and verify in UI', async ({ request, page }) => {
    const token = await loginAs(request);
    const fieldName = `E2E Text ${Date.now()}`;
    const res = await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/custom-fields`), {
      headers: authHeaders(token),
      data: { name: fieldName, type: 'TEXT', config: { type: 'TEXT' } },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto(`/projects/${PROJECTS.PLAT.key}/settings/custom-fields`);
    await expect(page.getByText(fieldName)).toBeVisible({ timeout: 10_000 });
  });

  test('new field button opens dialog', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/settings/custom-fields`);
    await expect(page.getByRole('heading', { name: 'Custom Fields' }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /new field/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 5_000 });
  });

  test('custom field CRUD via API', async ({ request }) => {
    const token = await loginAs(request);
    const fieldName = `API Field ${Date.now()}`;

    // Create
    const createRes = await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/custom-fields`), {
      headers: authHeaders(token),
      data: { name: fieldName, type: 'NUMBER', config: { type: 'NUMBER', min: 0, max: 100 } },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const field = createBody.data ?? createBody;

    // Read — list should contain the field
    const listRes = await request.get(apiUrl(`/projects/${PROJECTS.PLAT.key}/custom-fields`), {
      headers: authHeaders(token),
    });
    const listBody = await listRes.json();
    const items = listBody.data ?? listBody.items ?? listBody;
    const found = (Array.isArray(items) ? items : []).find((f: any) => f.name === fieldName);
    expect(found).toBeDefined();

    // Delete
    const deleteRes = await request.delete(apiUrl(`/projects/${PROJECTS.PLAT.key}/custom-fields/${field.id}`), {
      headers: authHeaders(token),
    });
    expect([200, 204]).toContain(deleteRes.status());
  });
});
