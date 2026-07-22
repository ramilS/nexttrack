import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { MailService } from '../src/modules/mail/mail.service';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

const mockMailService = {
  sendInvite: async () => {},
  sendPasswordReset: async () => {},
  sendMail: async () => {},
};

describe('Users Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (builder) =>
        builder.overrideProvider(MailService).useValue(mockMailService),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

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

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);
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

  async function createRegularUser(email: string, name: string) {
    const hash = await bcrypt.hash('userpass1', 4);
    return ctx.prisma.user.create({
      data: { email, name, passwordHash: hash, hasPassword: true, role: 'USER' },
    });
  }

  // ─── Profile ────────────────────────────────────────────────

  describe('Profile (GET/PATCH /users/me)', () => {
    it('should return current user without passwordHash', async () => {
      const res = await adminReq().get('/users/me').expect(200);

      expect(res.body.data.email).toBe('admin@test.local');
      expect(res.body.data.name).toBe('Admin User');
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    it('returns only the self-view fields — no admin moderation columns', async () => {
      const res = await adminReq().get('/users/me').expect(200);

      expect(Object.keys(res.body.data).sort()).toEqual([
        'avatarUrl',
        'email',
        'id',
        'name',
        'role',
      ]);
      // moderation columns must never reach the user's own /me response
      expect(res.body.data).not.toHaveProperty('isBlocked');
      expect(res.body.data).not.toHaveProperty('blockReason');
      expect(res.body.data).not.toHaveProperty('deletedAt');
    });

    it('should update own profile', async () => {
      const res = await adminReq()
        .patch('/users/me')
        .send({ name: 'Updated Admin' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Admin');
    });
  });

  // ─── Password ───────────────────────────────────────────────

  describe('Change password (PATCH /users/me/password)', () => {
    it('should change password with valid current password', async () => {
      await adminReq()
        .patch('/users/me/password')
        .send({ currentPassword: 'adminpass1', newPassword: 'NewPass123' })
        .expect(204);

      // Verify new password works
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@test.local', password: 'NewPass123' })
        .expect(200);
    });

    it('should reject wrong current password', async () => {
      await adminReq()
        .patch('/users/me/password')
        .send({ currentPassword: 'wrongpass', newPassword: 'NewPass123' })
        .expect(400);
    });
  });

  // ─── User List ──────────────────────────────────────────────

  describe('User list (GET /users)', () => {
    it('should list users with pagination', async () => {
      await createRegularUser('u1@test.local', 'User One');
      await createRegularUser('u2@test.local', 'User Two');

      const res = await adminReq()
        .get('/users?page=1&perPage=2')
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.total).toBe(3); // admin + 2 users
    });

    it('should search users by name', async () => {
      await createRegularUser('john@test.local', 'John Doe');
      await createRegularUser('jane@test.local', 'Jane Smith');

      const res = await adminReq()
        .get('/users?search=john')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('John Doe');
    });

    it('should filter by status (active/blocked/deleted)', async () => {
      const user = await createRegularUser('blocked@test.local', 'Blocked User');
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { isBlocked: true, blockedAt: new Date() },
      });

      const blockedRes = await adminReq()
        .get('/users?status=blocked')
        .expect(200);
      expect(blockedRes.body.items).toHaveLength(1);
      expect(blockedRes.body.items[0].email).toBe('blocked@test.local');

      const activeRes = await adminReq()
        .get('/users?status=active')
        .expect(200);
      expect(
        activeRes.body.items.every((u: { isBlocked: boolean }) => !u.isBlocked),
      ).toBe(true);
    });
  });

  // ─── Project memberships ──────────────────────────────────

  describe('User project memberships', () => {
    it('marks a sole Project Admin role as non-editable', async () => {
      const member = await createRegularUser('member@test.local', 'Project Member');
      await adminReq()
        .post('/projects')
        .send({ key: 'ROLE', name: 'Role Test' })
        .expect(201);

      const initial = await adminReq()
        .get(`/users/${adminId}/memberships`)
        .expect(200);

      expect(initial.body.data).toEqual([
        expect.objectContaining({
          project: expect.objectContaining({ key: 'ROLE' }),
          canChangeRole: false,
        }),
      ]);

      await adminReq()
        .post('/projects/ROLE/members')
        .send({
          userId: member.id,
          roleId: '00000000-0000-0000-0000-000000000001',
        })
        .expect(201);

      const withSecondAdmin = await adminReq()
        .get(`/users/${adminId}/memberships`)
        .expect(200);

      expect(withSecondAdmin.body.data[0]).toEqual(
        expect.objectContaining({ canChangeRole: true }),
      );
    });
  });

  // ─── Block / Unblock ───────────────────────────────────────

  describe('Block / Unblock', () => {
    it('should block a user and revoke their tokens', async () => {
      const user = await createRegularUser('victim@test.local', 'Victim');

      // Login as victim to create a refresh token
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'victim@test.local', password: 'userpass1' })
        .expect(200);

      const res = await adminReq()
        .patch(`/users/${user.id}/block`)
        .send({ reason: 'Spam' })
        .expect(200);

      expect(res.body.data.isBlocked).toBe(true);

      // Verify refresh tokens revoked
      const tokens = await ctx.prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
      });
      expect(tokens).toHaveLength(0);
    });

    it('should unblock a user', async () => {
      const user = await createRegularUser('blocked@test.local', 'Blocked');
      await adminReq()
        .patch(`/users/${user.id}/block`)
        .send({})
        .expect(200);

      const res = await adminReq()
        .patch(`/users/${user.id}/unblock`)
        .expect(200);

      expect(res.body.data.isBlocked).toBe(false);
    });

    it('should prevent admin from blocking themselves', async () => {
      await adminReq()
        .patch(`/users/${adminId}/block`)
        .send({})
        .expect(400);
    });
  });

  // ─── Soft Delete / Restore ─────────────────────────────────

  describe('Soft delete / Restore', () => {
    it('should soft-delete a user and revoke tokens', async () => {
      const user = await createRegularUser('deleteme@test.local', 'Delete Me');

      await adminReq()
        .delete(`/users/${user.id}`)
        .expect(204);

      const dbUser = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser!.deletedAt).not.toBeNull();
    });

    it('should restore a soft-deleted user', async () => {
      const user = await createRegularUser('restore@test.local', 'Restore Me');
      await adminReq().delete(`/users/${user.id}`).expect(204);

      const res = await adminReq()
        .post(`/users/${user.id}/restore`)
        .expect(200);

      expect(res.body.data.deletedAt).toBeNull();
    });

    it('should prevent admin from deleting themselves', async () => {
      await adminReq()
        .delete(`/users/${adminId}`)
        .expect(400);
    });

    it('should reject restoring a non-deleted user', async () => {
      const user = await createRegularUser('active@test.local', 'Active');

      await adminReq()
        .post(`/users/${user.id}/restore`)
        .expect(400);
    });
  });

  // ─── Invites ────────────────────────────────────────────────

  describe('Invites', () => {
    it('should send an invite and list it', async () => {
      const res = await adminReq()
        .post('/users/invite')
        .send({ email: 'newuser@test.local' })
        .expect(201);

      expect(res.body.data.email).toBe('newuser@test.local');
      expect(res.body.data.expiresAt).toBeTruthy();

      const listRes = await adminReq()
        .get('/users/invites')
        .expect(200);

      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject inviting an existing user email', async () => {
      await createRegularUser('existing@test.local', 'Existing');

      await adminReq()
        .post('/users/invite')
        .send({ email: 'existing@test.local' })
        .expect(409);
    });

    it('should reject duplicate pending invite', async () => {
      await adminReq()
        .post('/users/invite')
        .send({ email: 'dup@test.local' })
        .expect(201);

      await adminReq()
        .post('/users/invite')
        .send({ email: 'dup@test.local' })
        .expect(409);
    });

    it('should resend an invite with new token', async () => {
      const createRes = await adminReq()
        .post('/users/invite')
        .send({ email: 'resend@test.local' })
        .expect(201);
      const inviteId = createRes.body.data.id;

      const invite1 = await ctx.prisma.invite.findUnique({ where: { id: inviteId } });

      const resendRes = await adminReq()
        .post(`/users/invite/${inviteId}/resend`)
        .expect(200);

      expect(resendRes.body.data.id).toBe(inviteId);

      const invite2 = await ctx.prisma.invite.findUnique({ where: { id: inviteId } });
      expect(invite2!.token).not.toBe(invite1!.token);
    });

    it('should revoke a pending invite', async () => {
      const createRes = await adminReq()
        .post('/users/invite')
        .send({ email: 'revoke@test.local' })
        .expect(201);
      const inviteId = createRes.body.data.id;

      await adminReq()
        .delete(`/users/invite/${inviteId}`)
        .expect(204);

      const invite = await ctx.prisma.invite.findUnique({ where: { id: inviteId } });
      expect(invite!.status).toBe('REVOKED');
    });
  });
});
