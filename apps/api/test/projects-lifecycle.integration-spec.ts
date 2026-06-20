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

describe('Projects Lifecycle Integration (archive, restore, members)', () => {
  let ctx: E2eContext;
  let adminToken: string;

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

  // ─── Archive / Unarchive ──────────────────────────────────────────

  describe('Archive lifecycle', () => {
    it('should archive and unarchive a project', async () => {
      await authReq().post('/projects').send({ key: 'ARCH', name: 'Archivable' }).expect(201);

      // Archive
      await authReq().post('/projects/ARCH/archive').expect(200);

      // Verify archived
      const project = await ctx.prisma.project.findFirst({ where: { key: 'ARCH' } });
      expect(project!.archivedAt).not.toBeNull();

      // Unarchive
      await authReq().post('/projects/ARCH/unarchive').expect(200);

      // Verify unarchived
      const restored = await ctx.prisma.project.findFirst({ where: { key: 'ARCH' } });
      expect(restored!.archivedAt).toBeNull();
    });

    it('should hide archived projects from default listing', async () => {
      await authReq().post('/projects').send({ key: 'VIS', name: 'Visible' }).expect(201);
      await authReq().post('/projects').send({ key: 'HID', name: 'Hidden' }).expect(201);

      await authReq().post('/projects/HID/archive').expect(200);

      const listRes = await authReq().get('/projects').expect(200);
      const keys = (
        listRes.body.data ??
        listRes.body.items ??
        listRes.body
      ).map((p: { key: string }) => p.key);
      expect(keys).toContain('VIS');
      expect(keys).not.toContain('HID');
    });
  });

  // ─── Member Search ────────────────────────────────────────────────

  describe('Member operations', () => {
    it('should search members by name', async () => {
      await authReq().post('/projects').send({ key: 'MEM', name: 'Member Test' }).expect(201);

      const hash = await bcrypt.hash('memberpass1', 4);
      const member = await ctx.prisma.user.create({
        data: { email: 'member@test.local', name: 'Jane Developer', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      await authReq()
        .post('/projects/MEM/members')
        .send({ userId: member.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      const res = await authReq().get('/projects/MEM/members').expect(200);
      const members = res.body.data ?? res.body;
      expect(members.length).toBeGreaterThanOrEqual(2); // admin + member
    });

    it('should change member role', async () => {
      await authReq().post('/projects').send({ key: 'ROL', name: 'Role Change' }).expect(201);

      const hash = await bcrypt.hash('memberpass1', 4);
      const user = await ctx.prisma.user.create({
        data: { email: 'dev@test.local', name: 'Dev', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      await authReq()
        .post('/projects/ROL/members')
        .send({ userId: user.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Change to QA role
      await authReq()
        .patch(`/projects/ROL/members/${user.id}`)
        .send({ roleId: '00000000-0000-0000-0000-000000000003' })
        .expect(200);

      const pm = await ctx.prisma.projectMember.findFirst({
        where: { userId: user.id },
      });
      expect(pm!.roleId).toBe('00000000-0000-0000-0000-000000000003');
    });

    it('should remove member and unassign their issues', async () => {
      await authReq().post('/projects').send({ key: 'REM', name: 'Remove Member' }).expect(201);

      const hash = await bcrypt.hash('memberpass1', 4);
      const user = await ctx.prisma.user.create({
        data: { email: 'removable@test.local', name: 'Removable', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      await authReq()
        .post('/projects/REM/members')
        .send({ userId: user.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Assign issue to member
      const issueRes = await authReq()
        .post('/projects/REM/issues')
        .send({ title: 'Assigned Issue', assigneeId: user.id })
        .expect(201);

      // Remove member
      await authReq()
        .delete(`/projects/REM/members/${user.id}`)
        .expect(204);

      // Verify issue is unassigned
      const project = await ctx.prisma.project.findFirst({ where: { key: 'REM' } });
      const issue = await ctx.prisma.issue.findFirst({
        where: { projectId: project!.id, number: issueRes.body.data.number },
      });
      expect(issue!.assigneeId).toBeNull();
    });
  });
});
