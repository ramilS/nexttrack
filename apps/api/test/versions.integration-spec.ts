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

describe('Versions Integration', () => {
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

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    projectKey = 'VER';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Versions Project' })
      .expect(201);
  });

  function authReq() {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${adminToken}`),
      put: (url: string) =>
        request(ctx.app.getHttpServer())
          .put(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  function versionsUrl(id?: string) {
    const base = `/projects/${projectKey}/versions`;
    return id ? `${base}/${id}` : base;
  }

  async function createVersion(name: string, overrides?: Record<string, unknown>) {
    const res = await authReq()
      .post(versionsUrl())
      .send({ name, ...overrides })
      .expect(201);
    return res.body.data;
  }

  it('should create a version', async () => {
    const version = await createVersion('v1.0.0', {
      description: 'First release',
    });

    expect(version.name).toBe('v1.0.0');
    expect(version.status).toBe('UNRELEASED');
  });

  it('should list versions', async () => {
    await createVersion('v1.0');
    await createVersion('v2.0');

    const res = await authReq().get(versionsUrl()).expect(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should filter versions by status', async () => {
    await createVersion('v1.0');

    const res = await authReq()
      .get(versionsUrl() + '?status=UNRELEASED')
      .expect(200);
    expect(res.body.data).toHaveLength(1);

    const releasedRes = await authReq()
      .get(versionsUrl() + '?status=RELEASED')
      .expect(200);
    expect(releasedRes.body.data).toHaveLength(0);
  });

  it('should update a version', async () => {
    const version = await createVersion('v1.0');

    const res = await authReq()
      .patch(versionsUrl(version.id))
      .send({ name: 'v1.0.1', description: 'Patch release' })
      .expect(200);

    expect(res.body.data.name).toBe('v1.0.1');
  });

  it('should release a version', async () => {
    const version = await createVersion('v1.0');

    const res = await authReq()
      .patch(versionsUrl(version.id) + '/release')
      .send({})
      .expect(200);

    expect(res.body.data.status).toBe('RELEASED');
    expect(res.body.data.releaseDate).toBeTruthy();
  });

  it('should archive a version', async () => {
    const version = await createVersion('v1.0');

    const res = await authReq()
      .patch(versionsUrl(version.id) + '/archive')
      .expect(200);

    expect(res.body.data.status).toBe('ARCHIVED');
  });

  it('should delete a version not in use', async () => {
    const version = await createVersion('v1.0');

    await authReq()
      .delete(versionsUrl(version.id))
      .expect(204);
  });

  async function createVersionField(name: string, type: 'VERSION' | 'MULTI_VERSION') {
    const res = await authReq()
      .post(`/projects/${projectKey}/custom-fields`)
      .send({ name, type, config: { type } })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createIssue(title: string) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title, type: 'TASK' })
      .expect(201);
    return res.body.data.id as string;
  }

  it('should reject deleting a version referenced by a VERSION custom field', async () => {
    const version = await createVersion('v1.0');
    const fieldId = await createVersionField('Fix Version', 'VERSION');
    const issueId = await createIssue('Bug A');
    await authReq()
      .patch(`/issues/${issueId}/fields/${fieldId}`)
      .send({ value: version.id })
      .expect(200);

    const res = await authReq().delete(versionsUrl(version.id)).expect(409);
    expect(res.body.error.code).toBe('VERSION_IN_USE');
  });

  it('should detect a version inside a MULTI_VERSION array value', async () => {
    const version = await createVersion('v2.0');
    const fieldId = await createVersionField('Affects Versions', 'MULTI_VERSION');
    const issueId = await createIssue('Bug B');
    await authReq()
      .patch(`/issues/${issueId}/fields/${fieldId}`)
      .send({ value: [version.id] })
      .expect(200);

    const res = await authReq().delete(versionsUrl(version.id)).expect(409);
    expect(res.body.error.code).toBe('VERSION_IN_USE');
  });

  it('should reorder versions', async () => {
    const v1 = await createVersion('v1.0');
    const v2 = await createVersion('v2.0');

    await authReq()
      .put(versionsUrl() + '/reorder')
      .send({
        ordinals: [
          { id: v2.id, ordinal: 0 },
          { id: v1.id, ordinal: 1 },
        ],
      })
      .expect(200);

    const listRes = await authReq().get(versionsUrl()).expect(200);
    expect(listRes.body.data[0].name).toBe('v2.0');
  });

  it('should assign ascending ordinals', async () => {
    const v1 = await createVersion('v1.0');
    const v2 = await createVersion('v2.0');

    expect(v1.ordinal).toBe(0);
    expect(v2.ordinal).toBe(1);
  });
});
