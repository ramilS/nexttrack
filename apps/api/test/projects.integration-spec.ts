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

describe('Projects Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    // Seed admin user and get token
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
    adminId = admin.id;

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' });
    adminToken = extractAccessTokenFromCookies(res.headers["set-cookie"]);
  });

  function authReq() {
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
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

  describe('POST /projects', () => {
    it('should create a project', async () => {
      const res = await authReq()
        .post('/projects')
        .send({ key: 'TEST', name: 'Test Project' })
        .expect(201);

      expect(res.body.data.key).toBe('TEST');
      expect(res.body.data.name).toBe('Test Project');

      // Creator should be auto-added as OWNER
      const member = await ctx.prisma.projectMember.findFirst({
        where: { projectId: res.body.data.id, userId: adminId },
      });
      expect(member).toBeTruthy();
      expect(member!.roleId).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('should reject duplicate key', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'DUP', name: 'Project One' })
        .expect(201);

      await authReq()
        .post('/projects')
        .send({ key: 'DUP', name: 'Project Two' })
        .expect(409);
    });

    it('should reject unauthenticated request', async () => {
      await request(ctx.app.getHttpServer())
        .post('/projects')
        .send({ key: 'NOAUTH', name: 'No Auth' })
        .expect(401);
    });
  });

  describe('GET /projects', () => {
    it('should return list of projects', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'PROJ1', name: 'Project 1' });
      await authReq()
        .post('/projects')
        .send({ key: 'PROJ2', name: 'Project 2' });

      const res = await authReq()
        .get('/projects?page=1&perPage=20')
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /projects/:key', () => {
    it('should return project by key', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'DETAIL', name: 'Detail Project' });

      const res = await authReq()
        .get('/projects/DETAIL')
        .expect(200);

      expect(res.body.data.key).toBe('DETAIL');
      expect(res.body.data.name).toBe('Detail Project');
    });

    it('should 404 for non-existent key', async () => {
      await authReq()
        .get('/projects/NOPE')
        .expect(404);
    });
  });

  describe('PATCH /projects/:key', () => {
    it('should update project name', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'UPD', name: 'Original' });

      const res = await authReq()
        .patch('/projects/UPD')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Name');
    });
  });

  describe('POST /projects/:key/archive & unarchive', () => {
    it('should archive and unarchive project', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'ARCH', name: 'Archivable' });

      await authReq()
        .post('/projects/ARCH/archive')
        .expect(200);

      const archived = await ctx.prisma.project.findFirst({
        where: { key: 'ARCH' },
      });
      expect(archived!.archivedAt).not.toBeNull();

      await authReq()
        .post('/projects/ARCH/unarchive')
        .expect(200);

      const restored = await ctx.prisma.project.findFirst({
        where: { key: 'ARCH' },
      });
      expect(restored!.archivedAt).toBeNull();
    });
  });

  describe('Members', () => {
    it('should add and list members', async () => {
      await authReq()
        .post('/projects')
        .send({ key: 'MEM', name: 'Members Project' });

      // Create a regular user
      const hash = await bcrypt.hash('user123', 4);
      const user = await ctx.prisma.user.create({
        data: {
          email: 'member@test.local',
          name: 'Regular User',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });

      // Add as member
      await authReq()
        .post('/projects/MEM/members')
        .send({ userId: user.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // List members
      const res = await authReq()
        .get('/projects/MEM/members')
        .expect(200);

      expect(res.body.data.length).toBe(2); // admin + regular user
    });
  });

  describe('Non-admin user access', () => {
    it('non-admin cannot create project', async () => {
      const hash = await bcrypt.hash('userpass123', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'user@test.local',
          name: 'Regular User',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@test.local', password: 'userpass123' })
        .expect(200);
      const userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      await request(ctx.app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ key: 'NOPE', name: 'No Access' })
        .expect(403);
    });
  });
});
