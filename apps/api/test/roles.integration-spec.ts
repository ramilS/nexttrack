import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Permission } from '@repo/shared';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Roles Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let userToken: string;

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

    const userHash = await bcrypt.hash('userpass1', 4);
    await ctx.prisma.user.create({
      data: {
        email: 'user@test.local',
        name: 'Regular User',
        passwordHash: userHash,
        hasPassword: true,
        role: 'USER',
      },
    });

    const userLoginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.local', password: 'userpass1' })
      .expect(200);
    userToken = extractAccessTokenFromCookies(userLoginRes.headers["set-cookie"]);
  });

  function adminReq() {
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
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  describe('authorization boundary (@Roles(ADMIN))', () => {
    // Project Admin system role, seeded by seedSystemRoles — guards fire before the
    // handler, so the id only needs to be route-valid, not necessarily resolvable.
    const SYSTEM_ROLE_ID = '00000000-0000-0000-0000-000000000001';

    type Method = 'get' | 'post' | 'patch' | 'delete';
    interface Endpoint {
      method: Method;
      url: string;
      body?: Record<string, unknown>;
    }

    const endpoints: ReadonlyArray<Endpoint> = [
      { method: 'get', url: '/roles' },
      { method: 'get', url: `/roles/${SYSTEM_ROLE_ID}` },
      {
        method: 'post',
        url: '/roles',
        body: { name: 'Should Not Exist', permissions: [Permission.ISSUE_READ] },
      },
      { method: 'patch', url: `/roles/${SYSTEM_ROLE_ID}`, body: { description: 'nope' } },
      { method: 'delete', url: `/roles/${SYSTEM_ROLE_ID}` },
    ];

    function call({ method, url }: Endpoint, token?: string) {
      const agent = request(ctx.app.getHttpServer());
      const req =
        method === 'get'
          ? agent.get(url)
          : method === 'post'
            ? agent.post(url)
            : method === 'patch'
              ? agent.patch(url)
              : agent.delete(url);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    }

    it.each(endpoints)(
      'rejects a non-admin USER with 403: $method $url',
      async (endpoint) => {
        const req = call(endpoint, userToken);
        await (endpoint.body ? req.send(endpoint.body) : req).expect(403);
      },
    );

    it.each(endpoints)(
      'rejects an unauthenticated request with 401: $method $url',
      async (endpoint) => {
        const req = call(endpoint);
        await (endpoint.body ? req.send(endpoint.body) : req).expect(401);
      },
    );

    it('does not create a role when a non-admin attempts POST', async () => {
      await request(ctx.app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Sneaky Role', permissions: [Permission.ISSUE_READ] })
        .expect(403);

      const after = await adminReq().get('/roles').expect(200);
      expect(
        (after.body.data as Array<{ name: string }>).some(
          (r) => r.name === 'Sneaky Role',
        ),
      ).toBe(false);
    });
  });

  it('should list system roles', async () => {
    const res = await adminReq().get('/roles').expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    const names = (res.body.data as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain('Project Admin');
    expect(names).toContain('Developer');
  });

  it('should create a custom role', async () => {
    const res = await adminReq()
      .post('/roles')
      .send({
        name: 'Tester',
        description: 'QA role',
        permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE],
      })
      .expect(201);

    expect(res.body.data.name).toBe('Tester');
    expect(res.body.data.isSystem).toBe(false);
  });

  it('should reject duplicate role name', async () => {
    await adminReq()
      .post('/roles')
      .send({
        name: 'Custom Role',
        permissions: [Permission.ISSUE_READ],
      })
      .expect(201);

    await adminReq()
      .post('/roles')
      .send({
        name: 'Custom Role',
        permissions: [Permission.ISSUE_READ],
      })
      .expect(409);
  });

  it('should update a custom role', async () => {
    const createRes = await adminReq()
      .post('/roles')
      .send({
        name: 'Updatable',
        permissions: [Permission.ISSUE_READ],
      })
      .expect(201);

    const res = await adminReq()
      .patch(`/roles/${createRes.body.data.id}`)
      .send({ name: 'Updated Role', description: 'Updated desc' })
      .expect(200);

    expect(res.body.data.name).toBe('Updated Role');
  });

  it('should reject renaming a custom role to a name already taken (409, not 500)', async () => {
    await adminReq()
      .post('/roles')
      .send({ name: 'Existing Role', permissions: [Permission.ISSUE_READ] })
      .expect(201);

    const second = await adminReq()
      .post('/roles')
      .send({ name: 'Second Role', permissions: [Permission.ISSUE_READ] })
      .expect(201);

    await adminReq()
      .patch(`/roles/${second.body.data.id}`)
      .send({ name: 'Existing Role' })
      .expect(409);
  });

  it('should allow renaming a role to its own current name', async () => {
    const createRes = await adminReq()
      .post('/roles')
      .send({ name: 'Self Rename', permissions: [Permission.ISSUE_READ] })
      .expect(201);

    await adminReq()
      .patch(`/roles/${createRes.body.data.id}`)
      .send({ name: 'Self Rename', description: 'unchanged name' })
      .expect(200);
  });

  it('should reject renaming a system role', async () => {
    const systemRoleId = '00000000-0000-0000-0000-000000000001'; // Project Admin

    await adminReq()
      .patch(`/roles/${systemRoleId}`)
      .send({ name: 'Renamed Admin' })
      .expect(400);
  });

  it('should delete a custom role not assigned to members', async () => {
    const createRes = await adminReq()
      .post('/roles')
      .send({
        name: 'Deletable',
        permissions: [Permission.ISSUE_READ],
      })
      .expect(201);

    await adminReq()
      .delete(`/roles/${createRes.body.data.id}`)
      .expect(204);
  });

  it('should reject deleting a system role', async () => {
    const systemRoleId = '00000000-0000-0000-0000-000000000001';

    await adminReq()
      .delete(`/roles/${systemRoleId}`)
      .expect(400);
  });

  it('should reject deleting a role assigned to members', async () => {
    const createRes = await adminReq()
      .post('/roles')
      .send({
        name: 'Assigned Role',
        permissions: [Permission.ISSUE_READ],
      })
      .expect(201);
    const roleId = createRes.body.data.id;

    // Create a project and assign a member with this role
    await adminReq()
      .post('/projects')
      .send({ key: 'RL', name: 'Role Test' })
      .expect(201);

    // The admin is auto-assigned as Project Admin. Create a user and add as member
    const hash = await bcrypt.hash('user1pass', 4);
    const user = await ctx.prisma.user.create({
      data: {
        email: 'member@test.local',
        name: 'Member',
        passwordHash: hash,
        hasPassword: true,
        role: 'USER',
      },
    });

    const project = await ctx.prisma.project.findFirst({ where: { key: 'RL' } });
    await ctx.prisma.projectMember.create({
      data: {
        projectId: project!.id,
        userId: user.id,
        roleId,
      },
    });

    await adminReq()
      .delete(`/roles/${roleId}`)
      .expect(400);
  });
});
