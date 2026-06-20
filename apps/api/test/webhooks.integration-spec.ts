import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Webhooks Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('adminpass1', 4);
    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(res.headers["set-cookie"]);

    projectKey = 'WHK';
    await authReq().post('/projects').send({ key: projectKey, name: 'Webhook Project' }).expect(201);
  });

  function authReq(token?: string) {
    const t = token ?? adminToken;
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${t}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${t}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${t}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer()).delete(url).set('Authorization', `Bearer ${t}`),
    };
  }

  const validWebhook = {
    name: 'CI Webhook',
    url: 'https://ci.example.com/hooks',
    secret: 'a'.repeat(32),
    eventTypes: ['ASSIGNEE_CHANGED', 'STATUS_CHANGED'],
  };

  // ─── CRUD ─────────────────────────────────────────────────────────

  describe('POST /projects/:key/webhooks', () => {
    it('should create a webhook', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);

      expect(res.body.data.name).toBe('CI Webhook');
      expect(res.body.data.url).toBe(validWebhook.url);
      expect(res.body.data.isEnabled).toBe(true);
    });

    it('should reject webhook with short secret', async () => {
      await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send({ ...validWebhook, secret: 'short' })
        .expect(400);
    });

    it('should reject webhook with invalid URL', async () => {
      await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send({ ...validWebhook, url: 'not-a-url' })
        .expect(400);
    });
  });

  describe('GET /projects/:key/webhooks', () => {
    it('should list all webhooks for project', async () => {
      await authReq().post(`/projects/${projectKey}/webhooks`).send(validWebhook).expect(201);
      await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send({ ...validWebhook, name: 'Slack Webhook', url: 'https://slack.example.com/hook' })
        .expect(201);

      const res = await authReq().get(`/projects/${projectKey}/webhooks`).expect(200);
      const items = res.body.data ?? res.body;
      expect(items.length).toBe(2);
    });
  });

  // ─── Secret not leaked ────────────────────────────────────────────

  describe('Secret management', () => {
    it('should never expose secret in API responses', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);

      // Secret should not be in create response
      expect(createRes.body.data.secret).toBeUndefined();

      const webhookId = createRes.body.data.id;

      // Secret should not be in get response
      const getRes = await authReq()
        .get(`/projects/${projectKey}/webhooks/${webhookId}`)
        .expect(200);
      expect(getRes.body.data.secret).toBeUndefined();

      // Secret should not be in list response
      const listRes = await authReq()
        .get(`/projects/${projectKey}/webhooks`)
        .expect(200);
      const items = listRes.body.data ?? listRes.body;
      for (const item of items) {
        expect(item.secret).toBeUndefined();
      }
    });
  });

  // ─── Update & Toggle ──────────────────────────────────────────────

  describe('PATCH /projects/:key/webhooks/:id', () => {
    it('should update webhook name and URL', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);
      const webhookId = createRes.body.data.id;

      const updateRes = await authReq()
        .patch(`/projects/${projectKey}/webhooks/${webhookId}`)
        .send({ name: 'Updated Name', url: 'https://new.example.com/hook' })
        .expect(200);

      expect(updateRes.body.data.name).toBe('Updated Name');
      expect(updateRes.body.data.url).toBe('https://new.example.com/hook');
    });

    it('should disable and re-enable webhook', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);
      const webhookId = createRes.body.data.id;

      // Disable
      await authReq()
        .patch(`/projects/${projectKey}/webhooks/${webhookId}`)
        .send({ isEnabled: false })
        .expect(200);

      const disabled = await ctx.prisma.projectWebhook.findUnique({ where: { id: webhookId } });
      expect(disabled!.isEnabled).toBe(false);

      // Re-enable
      await authReq()
        .patch(`/projects/${projectKey}/webhooks/${webhookId}`)
        .send({ isEnabled: true })
        .expect(200);

      const reenabled = await ctx.prisma.projectWebhook.findUnique({ where: { id: webhookId } });
      expect(reenabled!.isEnabled).toBe(true);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('DELETE /projects/:key/webhooks/:id', () => {
    it('should hard-delete webhook', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);
      const webhookId = createRes.body.data.id;

      await authReq()
        .delete(`/projects/${projectKey}/webhooks/${webhookId}`)
        .expect(204);

      const found = await ctx.prisma.projectWebhook.findUnique({ where: { id: webhookId } });
      expect(found).toBeNull();
    });
  });

  // ─── Test endpoint ────────────────────────────────────────────────

  describe('POST /projects/:key/webhooks/:id/test', () => {
    it('should return test payload', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);
      const webhookId = createRes.body.data.id;

      const testRes = await authReq()
        .post(`/projects/${projectKey}/webhooks/${webhookId}/test`)
        .expect(200);

      expect(testRes.body.data.testPayload).toBeDefined();
      expect(testRes.body.data.testPayload.event).toBe('WEBHOOK_TEST');
    });
  });

  // ─── SSRF protection ──────────────────────────────────────────────

  describe('SSRF / URL allowlist', () => {
    it.each([
      ['http://example.com/hook', 'plain http rejected'],
      ['https://localhost/hook', 'localhost rejected'],
      ['https://service.local/hook', '.local TLD rejected'],
      ['https://service.internal/hook', '.internal TLD rejected'],
      ['https://127.0.0.1/hook', 'loopback IP rejected'],
      ['https://10.0.0.5/hook', 'RFC1918 10/8 rejected'],
      ['https://172.16.0.1/hook', 'RFC1918 172.16/12 rejected'],
      ['https://192.168.1.1/hook', 'RFC1918 192.168/16 rejected'],
      ['https://169.254.169.254/latest/meta-data', 'AWS metadata rejected'],
      ['https://[::1]/hook', 'IPv6 loopback rejected'],
      ['ftp://example.com/hook', 'non-http scheme rejected'],
      ['file:///etc/passwd', 'file scheme rejected'],
    ])('rejects %s (%s)', async (badUrl) => {
      await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send({ ...validWebhook, url: badUrl })
        .expect(400);
    });

    it('rejects update that would point an existing webhook to a private IP', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/webhooks/${createRes.body.data.id}`)
        .send({ url: 'https://169.254.169.254/' })
        .expect(400);
    });

    it('rejects update with weak secret (min 32, used to be 8)', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook)
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/webhooks/${createRes.body.data.id}`)
        .send({ secret: 'short-secret' })
        .expect(400);
    });
  });

  // ─── Access control ───────────────────────────────────────────────

  describe('Access control', () => {
    it('should reject non-member from managing webhooks', async () => {
      const hash = await bcrypt.hash('outsiderpass1', 4);
      await ctx.prisma.user.create({
        data: { email: 'outsider@test.local', name: 'Outsider', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'outsider@test.local', password: 'outsiderpass1' })
        .expect(200);

      const outsiderToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      const res = await authReq(outsiderToken)
        .post(`/projects/${projectKey}/webhooks`)
        .send(validWebhook);
      expect([403, 404]).toContain(res.status);
    });
  });
});
