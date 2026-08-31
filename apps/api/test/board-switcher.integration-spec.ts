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

/**
 * `GET /boards` backs the cross-project board switcher. Unlike every other
 * board route it is NOT `@ProjectAuth`-gated — it spans projects, so nothing
 * resolves a single `req.project` to check permissions against. Its isolation
 * therefore rests entirely on `ProjectAccessService`, and that is what these
 * tests pin: a board must never appear for someone outside its project.
 */
describe('Board switcher — GET /boards', () => {
  let ctx: E2eContext;
  let adminToken: string;

  const DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  function authReq(token?: string) {
    const t = token ?? adminToken;
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${t}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${t}`),
    };
  }

  async function createUserAndLogin(email: string, role: 'ADMIN' | 'USER' = 'USER') {
    const hash = await bcrypt.hash('password1', 4);
    const user = await ctx.prisma.user.create({
      data: {
        email,
        name: email.split('@')[0],
        passwordHash: hash,
        hasPassword: true,
        role,
      },
    });
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);
    return {
      userId: user.id,
      token: extractAccessTokenFromCookies(res.headers['set-cookie']),
    };
  }

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const admin = await createUserAndLogin('admin@test.local', 'ADMIN');
    adminToken = admin.token;

    await authReq().post('/projects').send({ key: 'ALPHA', name: 'Alpha' }).expect(201);
    await authReq().post('/projects').send({ key: 'BETA', name: 'Beta' }).expect(201);

    await authReq()
      .post('/projects/ALPHA/boards')
      .send({ name: 'Alpha Board' })
      .expect(201);
    await authReq()
      .post('/projects/BETA/boards')
      .send({ name: 'Beta Board' })
      .expect(201);
  });

  it('returns boards from every project a member belongs to', async () => {
    const user = await createUserAndLogin('member@test.local');
    await authReq()
      .post('/projects/ALPHA/members')
      .send({ userId: user.userId, roleId: DEVELOPER_ROLE_ID })
      .expect(201);
    await authReq()
      .post('/projects/BETA/members')
      .send({ userId: user.userId, roleId: DEVELOPER_ROLE_ID })
      .expect(201);

    const res = await authReq(user.token).get('/boards').expect(200);

    expect(res.body.data.map((b: { name: string }) => b.name).sort()).toEqual([
      'Alpha Board',
      'Beta Board',
    ]);
  });

  it('hides boards of projects the caller is not a member of', async () => {
    const user = await createUserAndLogin('outsider@test.local');
    await authReq()
      .post('/projects/ALPHA/members')
      .send({ userId: user.userId, roleId: DEVELOPER_ROLE_ID })
      .expect(201);

    const res = await authReq(user.token).get('/boards').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Alpha Board');
    expect(res.body.data[0].project.key).toBe('ALPHA');
  });

  it('returns an empty list for a user with no memberships', async () => {
    const user = await createUserAndLogin('lonely@test.local');

    const res = await authReq(user.token).get('/boards').expect(200);

    expect(res.body.data).toEqual([]);
  });

  it('gives a global admin every board without any membership', async () => {
    const res = await authReq().get('/boards').expect(200);

    expect(res.body.data.map((b: { name: string }) => b.name).sort()).toEqual([
      'Alpha Board',
      'Beta Board',
    ]);
  });

  it('carries the project identity each board belongs to', async () => {
    const res = await authReq().get('/boards').expect(200);

    const alpha = res.body.data.find(
      (b: { name: string }) => b.name === 'Alpha Board',
    );
    expect(alpha.project).toEqual({
      id: expect.any(String),
      key: 'ALPHA',
      name: 'Alpha',
    });
  });

  it('rejects an unauthenticated caller', async () => {
    await request(ctx.app.getHttpServer()).get('/boards').expect(401);
  });
});
