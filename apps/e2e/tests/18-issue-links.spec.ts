import { test, expect } from '@playwright/test';
import { PROJECTS } from '@fixtures/test-data';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';

test.describe('Feature: Issue Links (API)', () => {
  // NOTE: Issue detail page has a pre-existing bug ("Something went wrong").
  // These tests cover link CRUD via API boundary tests.

  test('create a link between two issues via API', async ({ request }) => {
    const token = await loginAs(request);

    const i1Body = await (await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(token),
      data: { title: `Link Source ${Date.now()}`, type: 'TASK', priority: 'MEDIUM' },
    })).json();
    const issue1 = i1Body.data ?? i1Body;

    const i2Body = await (await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(token),
      data: { title: `Link Target ${Date.now()}`, type: 'TASK', priority: 'MEDIUM' },
    })).json();
    const issue2 = i2Body.data ?? i2Body;

    const linkRes = await request.post(
      apiUrl(`/issues/${issue1.id}/links`),
      {
        headers: authHeaders(token),
        data: { targetIssueId: issue2.id, type: 'RELATES_TO' },
      },
    );
    expect(linkRes.status()).toBe(201);
  });

  test('list links for an issue', async ({ request }) => {
    const token = await loginAs(request);

    const iBody = await (await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(token),
      data: { title: `Links List ${Date.now()}`, type: 'TASK', priority: 'MEDIUM' },
    })).json();
    const issue = iBody.data ?? iBody;

    const linksRes = await request.get(
      apiUrl(`/issues/${issue.id}/links`),
      { headers: authHeaders(token) },
    );
    expect(linksRes.ok()).toBeTruthy();
  });

  test('reject self-referencing link', async ({ request }) => {
    const token = await loginAs(request);

    const iBody = await (await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(token),
      data: { title: `Self Link ${Date.now()}`, type: 'TASK', priority: 'MEDIUM' },
    })).json();
    const issue = iBody.data ?? iBody;

    const linkRes = await request.post(
      apiUrl(`/issues/${issue.id}/links`),
      {
        headers: authHeaders(token),
        data: { targetIssueId: issue.id, type: 'RELATES_TO' },
      },
    );
    expect(linkRes.status()).toBe(400);
  });
});
