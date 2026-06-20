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

describe('Telegram Integration (full AppModule)', () => {
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

    projectKey = 'TG';
    await authReq().post('/projects').send({ key: projectKey, name: 'Telegram Project' }).expect(201);
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

  const validConfig = {
    name: 'Team Bot',
    botToken: '1234567890:ABCdefGHIJklmnoPQRstuVWXyz',
    chatId: '-1001234567890',
    eventTypes: ['ISSUE_CREATED', 'STATUS_CHANGED'],
  };

  describe('POST /projects/:key/telegram', () => {
    it('should create a telegram config', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send(validConfig)
        .expect(201);

      expect(res.body.data.name).toBe('Team Bot');
      expect(res.body.data.chatId).toBe('-1001234567890');
      expect(res.body.data.eventTypes).toEqual(['ISSUE_CREATED', 'STATUS_CHANGED']);
      // botToken must never leak in responses
      expect(res.body.data.botToken).toBeUndefined();
    });

    it('should reject creating a second config for the same project', async () => {
      await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send(validConfig)
        .expect(201);

      const res = await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send({ ...validConfig, name: 'Duplicate' });

      expect(res.status).toBe(400);
    });

    it('should reject empty eventTypes', async () => {
      await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send({ ...validConfig, eventTypes: [] })
        .expect(400);
    });

    it('should reject missing botToken', async () => {
      const { botToken: _, ...rest } = validConfig;
      await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send(rest)
        .expect(400);
    });
  });

  describe('GET /projects/:key/telegram', () => {
    it('should return 404 when no config exists', async () => {
      await authReq().get(`/projects/${projectKey}/telegram`).expect(404);
    });

    it('should return config without botToken', async () => {
      await authReq().post(`/projects/${projectKey}/telegram`).send(validConfig).expect(201);

      const res = await authReq()
        .get(`/projects/${projectKey}/telegram`)
        .expect(200);

      expect(res.body.data.name).toBe('Team Bot');
      expect(res.body.data.botToken).toBeUndefined();
    });
  });

  describe('PATCH /projects/:key/telegram', () => {
    it('should update name and eventTypes', async () => {
      await authReq().post(`/projects/${projectKey}/telegram`).send(validConfig).expect(201);

      const res = await authReq()
        .patch(`/projects/${projectKey}/telegram`)
        .send({ name: 'Renamed Bot', eventTypes: ['COMMENT_ADDED'] })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Bot');
      expect(res.body.data.eventTypes).toEqual(['COMMENT_ADDED']);
    });

    it('should clear disabled state when re-enabling', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/telegram`)
        .send(validConfig)
        .expect(201);

      // Manually disable in DB to simulate auto-disable on consecutive failures
      await ctx.prisma.projectTelegramConfig.update({
        where: { id: createRes.body.data.id },
        data: {
          disabledAt: new Date(),
          disabledReason: 'Too many failures',
          consecutiveFailures: 5,
          isEnabled: false,
        },
      });

      const res = await authReq()
        .patch(`/projects/${projectKey}/telegram`)
        .send({ isEnabled: true })
        .expect(200);

      expect(res.body.data.isEnabled).toBe(true);
      expect(res.body.data.disabledAt).toBeNull();
      expect(res.body.data.consecutiveFailures).toBe(0);
    });

    it('should return 404 when updating non-existent config', async () => {
      await authReq()
        .patch(`/projects/${projectKey}/telegram`)
        .send({ name: 'Nothing here' })
        .expect(404);
    });
  });

  describe('DELETE /projects/:key/telegram', () => {
    it('should delete the config', async () => {
      await authReq().post(`/projects/${projectKey}/telegram`).send(validConfig).expect(201);

      await authReq().delete(`/projects/${projectKey}/telegram`).expect(204);

      await authReq().get(`/projects/${projectKey}/telegram`).expect(404);
    });

    it('should return 404 when deleting non-existent config', async () => {
      await authReq().delete(`/projects/${projectKey}/telegram`).expect(404);
    });
  });

  describe('POST /projects/:key/telegram/test', () => {
    it('should return test payload for existing config', async () => {
      await authReq().post(`/projects/${projectKey}/telegram`).send(validConfig).expect(201);

      const res = await authReq()
        .post(`/projects/${projectKey}/telegram/test`)
        .expect(200);

      expect(res.body.data.config.name).toBe('Team Bot');
      expect(res.body.data.testMessage).toContain('test');
    });

    it('should return 404 when no config exists', async () => {
      await authReq().post(`/projects/${projectKey}/telegram/test`).expect(404);
    });
  });

  describe('authorization', () => {
    it('should reject unauthenticated requests', async () => {
      await request(ctx.app.getHttpServer())
        .get(`/projects/${projectKey}/telegram`)
        .expect(401);
    });

    it('should reject users without WEBHOOK_MANAGE permission', async () => {
      const hash = await bcrypt.hash('userpass1', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'observer@test.local',
          name: 'Observer',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'observer@test.local', password: 'userpass1' })
        .expect(200);
      const userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      const user = await ctx.prisma.user.findFirst({ where: { email: 'observer@test.local' } });
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: user!.id, roleId: '00000000-0000-0000-0000-000000000005' })
        .expect(201);

      await authReq(userToken)
        .get(`/projects/${projectKey}/telegram`)
        .expect(403);
    });
  });
});
