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
const DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Pulls the `access_token=...` segment out of a Set-Cookie header, for tests
 * that authenticate via `.set('Cookie', ...)` instead of an Authorization
 * header.
 */
function accessTokenCookie(setCookieHeader: unknown): string {
  const cookies = (Array.isArray(setCookieHeader) ? setCookieHeader : []) as string[];
  const match = cookies.find((c) => c.startsWith('access_token='));
  if (!match) throw new Error('access_token cookie missing');
  return match.split(';')[0];
}

describe('API-key issue creation — dedupKey (full AppModule)', () => {
  let ctx: E2eContext;
  let projectKey: string;
  let rawKey: string;
  let adminCookie: string;
  let developerCookie: string;

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
        permissions: [...INTEGRATION_ROLE.permissions] as Prisma.InputJsonValue,
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
    adminCookie = accessTokenCookie(loginRes.headers['set-cookie']);

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

    // Developer role (seeded above by seedSystemRoles) lacks
    // PROJECT_SETTINGS_UPDATE — a real project member used to prove the
    // "key management endpoints" checks below are permission-gated, not
    // just admin-only.
    const developer = await ctx.prisma.user.create({
      data: {
        email: 'developer@test.local',
        name: 'Developer User',
        passwordHash: hash,
        hasPassword: true,
        role: 'USER',
      },
    });
    await ctx.prisma.projectMember.create({
      data: { userId: developer.id, projectId, roleId: DEVELOPER_ROLE_ID },
    });
    const developerLoginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'developer@test.local', password: 'adminpass1' })
      .expect(200);
    developerCookie = accessTokenCookie(developerLoginRes.headers['set-cookie']);
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

  describe('key management endpoints', () => {
    it('returns the raw secret only on creation', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/api-keys`)
        .set('Cookie', adminCookie)
        .send({ name: 'MyTracker' });

      expect(created.status).toBe(201);
      expect(created.body.data.raw).toMatch(/^nt_/);

      const listed = await request(ctx.app.getHttpServer())
        .get(`/projects/${projectKey}/api-keys`)
        .set('Cookie', adminCookie);

      expect(listed.status).toBe(200);
      expect(listed.body.data[0].prefix).toMatch(/^nt_/);
      expect(listed.body.data[0]).not.toHaveProperty('raw');
      expect(listed.body.data[0]).not.toHaveProperty('tokenHash');
      expect(listed.body.data[0]).not.toHaveProperty('userId');
    });

    it('rejects key management for a member without PROJECT_SETTINGS_UPDATE', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/api-keys`)
        .set('Cookie', developerCookie)
        .send({ name: 'Sneaky' });

      expect(res.status).toBe(403);
    });

    it('a revoked key stops working immediately', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/api-keys`)
        .set('Cookie', adminCookie)
        .send({ name: 'Temp' });

      expect(created.status).toBe(201);

      const beforeRevoke = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/issues`)
        .set('X-Api-Key', created.body.data.raw)
        .send({ title: 'before revoke' });

      expect(beforeRevoke.status).toBe(201);

      await request(ctx.app.getHttpServer())
        .delete(`/projects/${projectKey}/api-keys/${created.body.data.id}`)
        .set('Cookie', adminCookie)
        .expect(204);

      const res = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/issues`)
        .set('X-Api-Key', created.body.data.raw)
        .send({ title: 'after revoke' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('API_KEY_INVALID');
    });

    // The route under test is `PATCH /projects/:key/issues/:number` (issue
    // number, not id) — verified against IssuesController, which requires
    // Permission.ISSUE_UPDATE. INTEGRATION_ROLE (integration-role.ts)
    // deliberately excludes it.
    it('the Integration role cannot update an issue', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/issues`)
        .set('X-Api-Key', rawKey)
        .send({ title: 'read only' });

      expect(created.status).toBe(201);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/projects/${projectKey}/issues/${created.body.data.number}`)
        .set('X-Api-Key', rawKey)
        .send({ title: 'changed' });

      expect(res.status).toBe(403);
    });
  });

  /**
   * The brief for this scenario assumed `GET /users?projectKey=` is the
   * assignee-picker endpoint. It isn't: `/users` is the admin-only, non-
   * project-scoped user directory (`ListUsersQueryDto` has no `projectKey`),
   * and the frontend assignee picker / mention-suggestion list / "add to
   * team" picker all read `GET /projects/:key/members` (`useProjectMembers`)
   * — the same endpoint the members-list case below already exercises.
   * These cases target the real endpoints instead: the member list (which
   * doubles as the assignee-picker and mention-suggestion source), the
   * member search/autocomplete endpoint, and the addable-users endpoint
   * (the "invite an existing user" candidate list, tested across a second
   * project so the SERVICE principal isn't already excluded merely for
   * being a member of the first one).
   */
  describe('service principals are hidden from people-facing lists', () => {
    it('does not appear in the project members list', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/projects/${projectKey}/members`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(
        res.body.data.some((m: { user: { email: string } }) =>
          m.user.email.endsWith('@integrations.invalid'),
        ),
      ).toBe(false);
    });

    it('does not appear in member search results', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/projects/${projectKey}/members/search`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(
        res.body.data.some((u: { email: string }) => u.email.endsWith('@integrations.invalid')),
      ).toBe(false);
    });

    it('is not offered as an addable member of a project it has not joined', async () => {
      const otherProjectKey = 'DDK2';
      const otherProjectRes = await request(ctx.app.getHttpServer())
        .post('/projects')
        .set('Cookie', adminCookie)
        .send({ key: otherProjectKey, name: 'Second Project' });
      expect(otherProjectRes.status).toBe(201);

      // The SERVICE principal is a member of `projectKey` but not of
      // `otherProjectKey` — without the `kind` filter it would legitimately
      // qualify as "addable" here, so this exercises the filter rather than
      // the pre-existing "already a member" exclusion.
      const res = await request(ctx.app.getHttpServer())
        .get(`/projects/${otherProjectKey}/members/addable`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(
        res.body.data.some((u: { email: string }) => u.email.endsWith('@integrations.invalid')),
      ).toBe(false);
    });

    it('still renders as the reporter of the issue it created', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post(`/projects/${projectKey}/issues`)
        .set('X-Api-Key', rawKey)
        .send({ title: 'from the machine' });

      expect(created.status).toBe(201);

      const detail = await request(ctx.app.getHttpServer())
        .get(`/projects/${projectKey}/issues/${created.body.data.number}`)
        .set('Cookie', adminCookie);

      expect(detail.status).toBe(200);
      expect(detail.body.data.reporter.kind).toBe('SERVICE');
    });
  });
});
