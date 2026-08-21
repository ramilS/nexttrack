import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import { INTEGRATION_ROLE } from '@/modules/api-keys/integration-role';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

/**
 * Integration coverage for `dedupKey` on issue creation via an API-key
 * principal: a fast-path hit, the lost-insert-race recovery (the reason the
 * partial unique index exists at all), and the soft-delete-frees-the-key
 * semantics the index's WHERE clause encodes.
 *
 * The key-management HTTP endpoints (a later task) don't exist yet, so the
 * key is minted directly through `ApiKeysService`, exactly as that endpoint
 * will eventually do.
 */
describe('API-key issue creation — dedupKey (full AppModule)', () => {
  let ctx: E2eContext;
  let projectKey: string;
  let rawKey: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    // seedSystemRoles() predates the API-key feature and doesn't include the
    // Integration role — the service-principal's ProjectMember FK needs the
    // row to exist before ApiKeysService.issue() can create it.
    await ctx.prisma.role.create({
      data: {
        id: INTEGRATION_ROLE.id,
        name: INTEGRATION_ROLE.name,
        description: INTEGRATION_ROLE.description,
        permissions: INTEGRATION_ROLE.permissions as unknown as Prisma.InputJsonValue,
        isSystem: INTEGRATION_ROLE.isSystem,
      },
    });

    const hash = await bcrypt.hash('adminpass1', 4);
    const admin = await ctx.prisma.user.create({
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
    const adminToken = extractAccessTokenFromCookies(loginRes.headers['set-cookie']);

    projectKey = 'DDK';
    const projectRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: projectKey, name: 'Dedup Key Project' })
      .expect(201);
    const projectId = projectRes.body.data.id;

    const apiKeysService = ctx.app.get(ApiKeysService);
    const issued = await apiKeysService.issue(
      projectId,
      { name: 'ci-integration', expiresAt: null },
      admin.id,
    );
    rawKey = issued.raw;
  });

  it('creates once, then returns the same issue for a repeated dedupKey', async () => {
    const first = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'TypeError: null', dedupKey: 'group-abc' });

    expect(first.status).toBe(201);

    const second = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'TypeError: null', dedupKey: 'group-abc' });

    expect(second.status).toBe(200);
    expect(second.body.meta.deduplicated).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('two concurrent requests with one dedupKey produce exactly one issue', async () => {
    const send = () =>
      request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/issues`)
        .set('X-Api-Key', rawKey)
        .send({ title: 'race', dedupKey: 'group-race' });

    const [a, b] = await Promise.all([send(), send()]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);

    const count = await ctx.prisma.issue.count({
      where: { dedupKey: 'group-race', deletedAt: null },
    });
    expect(count).toBe(1);
  });

  it('frees the key when the issue is soft-deleted', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'noise', dedupKey: 'group-noise' });

    await ctx.prisma.issue.update({
      where: { id: created.body.data.id },
      data: { deletedAt: new Date() },
    });

    const again = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'noise', dedupKey: 'group-noise' });

    expect(again.status).toBe(201);
    expect(again.body.data.id).not.toBe(created.body.data.id);
  });
});
