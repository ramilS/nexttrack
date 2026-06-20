import { test, expect } from '@playwright/test';
import { PROJECTS } from '@fixtures/test-data';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';

test.describe('Feature: Time Tracking', () => {
  // NOTE: Issue detail page has a pre-existing bug ("Something went wrong").
  // These tests cover the parts that work without issue detail navigation.

  test('personal time report page loads', async ({ page }) => {
    await page.goto('/my-time-report');
    await expect(page.getByText(/time report/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('project time report page loads', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/time-report`);
    await expect(page.getByText(/time/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('timer API works — start, get, discard', async ({ request }) => {
    const token = await loginAs(request);

    // Create a fresh issue
    const issueRes = await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(token),
      data: { title: `Timer API E2E ${Date.now()}`, type: 'TASK', priority: 'MEDIUM' },
    });
    const body = await issueRes.json();
    const issueId = (body.data ?? body).id;

    // Start timer
    const startRes = await request.post(apiUrl('/time-tracking/timer/start'), {
      headers: authHeaders(token),
      data: { issueId },
    });
    expect(startRes.status()).toBe(201);

    // Get active timer
    const timerRes = await request.get(apiUrl('/time-tracking/timer'), {
      headers: authHeaders(token),
    });
    expect(timerRes.ok()).toBeTruthy();
    const timer = await timerRes.json();
    expect((timer.data ?? timer).issueId).toBe(issueId);

    // Discard timer
    const discardRes = await request.post(apiUrl('/time-tracking/timer/discard'), {
      headers: authHeaders(token),
    });
    expect(discardRes.status()).toBe(204);
  });
});
