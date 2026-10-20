import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash, randomBytes } from 'crypto';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

// The only suite where attachments hit a real object store (Garage in a
// testcontainer); the API integration suite mocks storage.
test.describe('API: Attachments round-trip through object storage', () => {
  let adminToken: string;
  let issueId: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
    const res = await request.post(apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`), {
      headers: authHeaders(adminToken),
      data: { title: `E2E Attachments ${Date.now()}` },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    issueId = (await res.json()).data.id;
  });

  async function upload(
    request: APIRequestContext,
    name: string,
    buffer: Buffer,
  ): Promise<string> {
    const res = await request.post(apiUrl(`/issues/${issueId}/attachments`), {
      headers: authHeaders(adminToken),
      multipart: { files: { name, mimeType: 'application/zip', buffer } },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).data[0].id;
  }

  test('downloads exactly the bytes that were uploaded', async ({ request }) => {
    // Random bytes under an allowed non-image type (only images are sniffed):
    // not valid UTF-8, so any text decoding along the way corrupts them.
    const original = randomBytes(1024 * 1024);
    const attachmentId = await upload(request, 'payload.zip', original);

    const res = await request.get(
      apiUrl(`/issues/${issueId}/attachments/${attachmentId}/download`),
      { headers: authHeaders(adminToken), maxRedirects: 0 },
    );

    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('filename="payload.zip"');
    const downloaded = await res.body();
    expect(downloaded.length).toBe(original.length);
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      createHash('sha256').update(original).digest('hex'),
    );
  });

  test('a deleted attachment is no longer downloadable', async ({ request }) => {
    const attachmentId = await upload(request, 'gone.zip', randomBytes(64));
    const del = await request.delete(
      apiUrl(`/issues/${issueId}/attachments/${attachmentId}`),
      { headers: authHeaders(adminToken) },
    );
    expect(del.status()).toBe(204);

    const res = await request.get(
      apiUrl(`/issues/${issueId}/attachments/${attachmentId}/download`),
      { headers: authHeaders(adminToken), maxRedirects: 0 },
    );

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('ATTACHMENT_NOT_FOUND');
  });
});
