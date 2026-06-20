import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
} from './support/create-e2e-app';

describe('Auth Integration (full AppModule)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
  });

  async function seedUser(
    email = 'test@test.local',
    password = 'password123',
    overrides: Partial<Prisma.UserCreateInput> = {},
  ) {
    const hash = await bcrypt.hash(password, 4); // low rounds for speed
    return ctx.prisma.user.create({
      data: {
        email,
        name: 'Test User',
        passwordHash: hash,
        hasPassword: true,
        role: 'USER',
        ...overrides,
      },
    });
  }

  // --- Login ---

  describe('POST /auth/login', () => {
    it('should login and return access token + refresh cookie', async () => {
      await seedUser();

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);

      expect(extractAccessTokenFromCookies(res.headers["set-cookie"])).toBeDefined();
      expect(res.body.data.user.email).toBe('test@test.local');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });

    it('should reject wrong password with 401', async () => {
      await seedUser();

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'wrong-pass' })
        .expect(401);
    });

    it('should reject non-existent user with 401', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@test.local', password: 'password123' })
        .expect(401);
    });

    it('should reject blocked user with 403', async () => {
      await seedUser('blocked@test.local', 'password123', {
        isBlocked: true,
        blockedAt: new Date(),
      });

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'blocked@test.local', password: 'password123' })
        .expect(403);
    });

    it('should reject deleted user with 403', async () => {
      await seedUser('deleted@test.local', 'password123', {
        deletedAt: new Date(),
      });

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'deleted@test.local', password: 'password123' })
        .expect(403);
    });
  });

  // --- Protected routes ---

  describe('Protected routes', () => {
    it('should access with valid JWT', async () => {
      await seedUser();

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' });

      await request(ctx.app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${extractAccessTokenFromCookies(loginRes.headers["set-cookie"])}`)
        .expect(204);
    });

    it('should reject request without token', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/logout')
        .expect(401);
    });
  });

  // --- Full flow ---

  describe('Full auth lifecycle', () => {
    it('login → logout-all → all tokens revoked', async () => {
      await seedUser();

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);

      await request(ctx.app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${extractAccessTokenFromCookies(loginRes.headers["set-cookie"])}`)
        .expect(204);

      const active = await ctx.prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(active).toBe(0);
    });

    it('multiple logins create separate sessions', async () => {
      await seedUser();

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' });

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' });

      const tokenCount = await ctx.prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(tokenCount).toBe(2);
    });
  });

  // --- Refresh ---

  describe('POST /auth/refresh', () => {
    function refreshCookie(setCookieHeader: unknown): string {
      const cookies = (Array.isArray(setCookieHeader) ? setCookieHeader : []) as string[];
      const match = cookies.find((c) => c.startsWith('refresh_token='));
      if (!match) throw new Error('refresh_token cookie missing');
      // Pass the whole "name=value" segment back as a Cookie header
      return match.split(';')[0];
    }

    it('should rotate refresh token and revoke the old one', async () => {
      await seedUser();
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);

      const oldRefresh = refreshCookie(loginRes.headers['set-cookie']);

      const refreshRes = await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', oldRefresh)
        .expect(204);

      // New tokens should be issued
      const newCookies = refreshRes.headers['set-cookie'] as unknown as string[];
      expect(newCookies.some((c) => c.startsWith('access_token='))).toBe(true);
      expect(newCookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

      // Old refresh token must be marked revoked
      const revoked = await ctx.prisma.refreshToken.count({
        where: { revokedAt: { not: null } },
      });
      expect(revoked).toBeGreaterThanOrEqual(1);
    });

    it('should reject reused old refresh token with 401 and revoke ALL tokens (RFC 6819)', async () => {
      await seedUser();
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);
      const oldRefresh = refreshCookie(loginRes.headers['set-cookie']);

      // First refresh — succeeds and rotates
      await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', oldRefresh)
        .expect(204);

      // Replay the original (now-revoked) token — reuse detection
      await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', oldRefresh)
        .expect(401);

      // All tokens for the user should now be revoked
      const active = await ctx.prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(active).toBe(0);
    });

    it('should reject refresh without cookie', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);
    });

    it('should let at most one of two concurrent refreshes with the same token succeed', async () => {
      await seedUser();
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);
      const oldRefresh = refreshCookie(loginRes.headers['set-cookie']);

      const [resA, resB] = await Promise.all([
        request(ctx.app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', oldRefresh),
        request(ctx.app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', oldRefresh),
      ]);

      const statuses = [resA.status, resB.status].sort();
      const successes = statuses.filter((s) => s === 204).length;
      expect(successes).toBeLessThanOrEqual(1);
      expect(statuses.every((s) => s === 204 || s === 401)).toBe(true);

      const activeTokens = await ctx.prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(activeTokens).toBeLessThanOrEqual(1);
    });
  });

  // --- Single-session logout ---

  describe('POST /auth/logout', () => {
    it('should revoke only the current session, not all', async () => {
      await seedUser();

      // Two separate logins → two refresh tokens
      const a = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.local', password: 'password123' })
        .expect(200);

      const aRefresh = ((a.headers['set-cookie'] as unknown as string[]) ?? [])
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];
      const aAccess = extractAccessTokenFromCookies(a.headers['set-cookie']);

      await request(ctx.app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${aAccess}`)
        .set('Cookie', aRefresh)
        .expect(204);

      const active = await ctx.prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(active).toBe(1);
    });
  });

  // --- Methods discovery ---

  describe('GET /auth/methods', () => {
    it('should return available auth methods (Public)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/auth/methods')
        .expect(200);

      expect(res.body.data).toBeDefined();
      // At minimum, password method should be available
      expect(Array.isArray(res.body.data) || typeof res.body.data === 'object').toBe(true);
    });
  });

  // --- Invite flow ---

  describe('Invite acceptance', () => {
    async function createInvite(opts: {
      email: string;
      token: string;
      expired?: boolean;
      status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
    }) {
      const admin = await ctx.prisma.user.create({
        data: {
          email: 'inviter@test.local',
          name: 'Inviter',
          passwordHash: await bcrypt.hash('x', 4),
          hasPassword: true,
          role: 'ADMIN',
        },
      });
      const expiresAt = opts.expired
        ? new Date(Date.now() - 1_000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      return ctx.prisma.invite.create({
        data: {
          email: opts.email,
          token: opts.token,
          role: 'USER',
          status: opts.status ?? 'PENDING',
          expiresAt,
          senderId: admin.id,
        },
      });
    }

    it('GET /auth/invite/validate/:token should return valid:true for active token', async () => {
      await createInvite({ email: 'invitee@test.local', token: '11111111-1111-1111-1111-111111111111' });

      const res = await request(ctx.app.getHttpServer())
        .get('/auth/invite/validate/11111111-1111-1111-1111-111111111111')
        .expect(200);

      expect(res.body.data.valid).toBe(true);
      // Enriched so the accept page can show "<inviter> invited you…"
      expect(typeof res.body.data.inviterName).toBe('string');
      expect(res.body.data.email).toBe('invitee@test.local');
    });

    it('GET /auth/invite/validate/:token should return reason "expired" for expired token', async () => {
      await createInvite({ email: 'expired@test.local', token: '22222222-2222-2222-2222-222222222222', expired: true });

      const res = await request(ctx.app.getHttpServer())
        .get('/auth/invite/validate/22222222-2222-2222-2222-222222222222')
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('expired');
    });

    it('GET /auth/invite/validate/:token should return reason "invalid" for unknown token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/auth/invite/validate/unknown-token')
        .expect(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('invalid');
    });

    it('GET /auth/invite/validate/:token should return reason "used" for an accepted token', async () => {
      await createInvite({
        email: 'used@test.local',
        token: '66666666-6666-6666-6666-666666666666',
        status: 'ACCEPTED',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/auth/invite/validate/66666666-6666-6666-6666-666666666666')
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('used');
    });

    it('GET /auth/invite/validate/:token should return reason "revoked" for a revoked token', async () => {
      await createInvite({
        email: 'revoked@test.local',
        token: '77777777-7777-7777-7777-777777777777',
        status: 'REVOKED',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/auth/invite/validate/77777777-7777-7777-7777-777777777777')
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('revoked');
    });

    it('POST /auth/invite/accept creates user, sets cookies, marks invite used', async () => {
      await createInvite({ email: 'newbie@test.local', token: '44444444-4444-4444-4444-444444444444' });

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/invite/accept')
        .send({ token: '44444444-4444-4444-4444-444444444444', name: 'Newbie', password: 'NewPass123' })
        .expect(201);

      expect(res.body.data.user.email).toBe('newbie@test.local');
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);

      const invite = await ctx.prisma.invite.findFirst({ where: { token: '44444444-4444-4444-4444-444444444444' } });
      expect(invite!.acceptedAt).not.toBeNull();
    });

    it('POST /auth/invite/accept rejects expired token', async () => {
      await createInvite({ email: 'late@test.local', token: '55555555-5555-5555-5555-555555555555', expired: true });

      await request(ctx.app.getHttpServer())
        .post('/auth/invite/accept')
        .send({ token: '55555555-5555-5555-5555-555555555555', name: 'Late', password: 'LatePass1' })
        .expect(400);
    });
  });
});
