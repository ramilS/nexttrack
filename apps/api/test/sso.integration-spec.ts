import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  E2eContext,
} from './support/create-e2e-app';
import { GoogleProvider } from '@/modules/sso/providers/google.provider';
import { MicrosoftProvider } from '@/modules/sso/providers/microsoft.provider';
import { ErrorCode } from '@repo/shared/error-codes';

const MOCK_USER_INFO: {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
} = {
  sub: 'google-uid-123',
  email: 'sso-user@company.dev',
  emailVerified: true,
  name: 'SSO User',
  picture: 'https://example.com/avatar.png',
};

const MOCK_TOKEN_RESPONSE = {
  access_token: 'mock-access-token',
  token_type: 'Bearer',
  expires_in: 3600,
};

function createMockOidcProvider(
  overrides: { userInfo?: Partial<typeof MOCK_USER_INFO> } = {},
) {
  const userInfo = { ...MOCK_USER_INFO, ...overrides.userInfo };
  return {
    getAuthorizationUrl: jest.fn(
      (params: { state: string }) =>
        `https://mock-oauth.test/auth?state=${params.state}`,
    ),
    exchangeCode: jest.fn(async () => MOCK_TOKEN_RESPONSE),
    getUserInfo: jest.fn(async () => userInfo),
  };
}

describe('SSO Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  const mockGoogle = createMockOidcProvider();
  const mockMicrosoft = createMockOidcProvider({
    userInfo: { sub: 'ms-uid-456', email: 'sso-user@company.dev', name: 'MS User' },
  });

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (builder) =>
        builder
          .overrideProvider(GoogleProvider)
          .useValue(mockGoogle)
          .overrideProvider(MicrosoftProvider)
          .useValue(mockMicrosoft),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);

    mockGoogle.exchangeCode.mockResolvedValue(MOCK_TOKEN_RESPONSE);
    mockGoogle.getUserInfo.mockResolvedValue({ ...MOCK_USER_INFO });

    const hash = await bcrypt.hash('adminpass1', 4);
    const admin = await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin',
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

  async function createProvider(
    overrides: Record<string, unknown> = {},
  ) {
    const res = await adminReq()
      .post('/admin/sso/providers')
      .send({
        name: 'Google SSO',
        type: 'GOOGLE',
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        allowedDomain: 'company.dev',
        provisioningPolicy: 'AUTO_PROVISION',
        ...overrides,
      })
      .expect(201);
    return res.body.data;
  }

  async function enableProvider(providerId: string) {
    await adminReq()
      .post(`/admin/sso/providers/${providerId}/enable`)
      .expect(200);
  }

  async function createAndEnableProvider(
    overrides: Record<string, unknown> = {},
  ) {
    const provider = await createProvider(overrides);
    await enableProvider(provider.id);
    return provider;
  }

  // ─── Admin CRUD ───────────────────────────────────────────

  describe('Admin Provider CRUD', () => {
    it('should create a provider with masked secret', async () => {
      const provider = await createProvider();

      expect(provider.name).toBe('Google SSO');
      expect(provider.type).toBe('GOOGLE');
      expect(provider.clientSecret).toBe('••••••••');
      expect(provider.allowedDomain).toBe('company.dev');
      expect(provider.isEnabled).toBe(false);
    });

    it('should list providers with connection count', async () => {
      await createProvider();
      await createProvider({
        name: 'Microsoft SSO',
        type: 'MICROSOFT',
        clientId: 'ms-client-id',
        clientSecret: 'ms-client-secret',
      });

      const res = await adminReq()
        .get('/admin/sso/providers')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].connectionsCount).toBe(0);
      expect(res.body.data[0].clientSecret).toBe('••••••••');
    });

    it('should update provider name and domain', async () => {
      const provider = await createProvider();

      const res = await adminReq()
        .patch(`/admin/sso/providers/${provider.id}`)
        .send({ name: 'Updated Google', allowedDomain: 'ACME.COM' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Google');
      expect(res.body.data.allowedDomain).toBe('acme.com');
    });

    it('should enable a fully configured provider', async () => {
      const provider = await createProvider();

      const res = await adminReq()
        .post(`/admin/sso/providers/${provider.id}/enable`)
        .expect(200);

      expect(res.body.data.isEnabled).toBe(true);
    });

    it('should disable an enabled provider', async () => {
      const provider = await createAndEnableProvider();

      const res = await adminReq()
        .post(`/admin/sso/providers/${provider.id}/disable`)
        .expect(200);

      expect(res.body.data.isEnabled).toBe(false);
    });

    it('should delete a provider without connections', async () => {
      const provider = await createProvider();

      await adminReq()
        .delete(`/admin/sso/providers/${provider.id}`)
        .expect(204);

      await adminReq()
        .get(`/admin/sso/providers/${provider.id}`)
        .expect(404);
    });

    it('should reject delete when provider has connections', async () => {
      const provider = await createAndEnableProvider();

      // Simulate a connection via direct DB insert
      const user = await ctx.prisma.user.create({
        data: {
          email: 'connected@company.dev',
          name: 'Connected',
          hasPassword: false,
          role: 'USER',
        },
      });
      await ctx.prisma.ssoConnection.create({
        data: {
          userId: user.id,
          providerId: provider.id,
          externalId: 'ext-123',
          email: user.email,
        },
      });

      const res = await adminReq()
        .delete(`/admin/sso/providers/${provider.id}`)
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.SSO_HAS_CONNECTIONS);
    });

    it('should reject non-admin access', async () => {
      const hash = await bcrypt.hash('userpass1', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'regular@test.local',
          name: 'Regular',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'regular@test.local', password: 'userpass1' })
        .expect(200);
      const userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      await request(ctx.app.getHttpServer())
        .get('/admin/sso/providers')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  // ─── Public Provider List ─────────────────────────────────

  describe('Public Providers', () => {
    it('should return only enabled providers without secrets', async () => {
      await createProvider(); // disabled
      await createAndEnableProvider({
        name: 'Enabled Google',
        type: 'MICROSOFT',
        clientId: 'ms-id',
        clientSecret: 'ms-secret',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/auth/sso/providers')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Enabled Google');
      expect(res.body.data[0]).not.toHaveProperty('clientSecret');
      expect(res.body.data[0]).not.toHaveProperty('clientId');
    });
  });

  // ─── OAuth Callback Flow ──────────────────────────────────

  describe('OAuth Callback Flow', () => {
    it('should auto-provision new user on callback', async () => {
      const provider = await createAndEnableProvider();

      // Step 1: Generate auth URL (stores state in Redis)
      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);

      const redirectUrl = authRes.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state')!;

      // Step 2: Simulate callback with code + state
      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      // Should redirect to finalize URL
      const finalizeUrl = new URL(callbackRes.headers.location);
      expect(finalizeUrl.pathname).toBe('/auth/sso/result');
      const finalizeCode = finalizeUrl.searchParams.get('token')!;
      expect(finalizeCode).toMatch(/^[0-9a-f]{64}$/);

      // Step 3: Finalize — exchange code for tokens
      const finalizeRes = await request(ctx.app.getHttpServer())
        .post('/auth/sso/finalize')
        .send({ code: finalizeCode })
        .expect(200);

      expect(extractAccessTokenFromCookies(finalizeRes.headers["set-cookie"])).toBeTruthy();

      // Verify user was created in DB
      const createdUser = await ctx.prisma.user.findFirst({
        where: { email: 'sso-user@company.dev' },
      });
      expect(createdUser).not.toBeNull();
      expect(createdUser!.name).toBe('SSO User');
      expect(createdUser!.hasPassword).toBe(false);
      expect(createdUser!.avatarUrl).toBe('https://example.com/avatar.png');

      // Verify SSO connection was created
      const connection = await ctx.prisma.ssoConnection.findFirst({
        where: { userId: createdUser!.id, providerId: provider.id },
      });
      expect(connection).not.toBeNull();
      expect(connection!.externalId).toBe('google-uid-123');
    });

    it('should link existing user by email on callback', async () => {
      const provider = await createAndEnableProvider();

      // Create a user with matching email
      const hash = await bcrypt.hash('existing-pass', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'sso-user@company.dev',
          name: 'Existing User',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      const finalizeCode = new URL(callbackRes.headers.location).searchParams.get('token')!;

      await request(ctx.app.getHttpServer())
        .post('/auth/sso/finalize')
        .send({ code: finalizeCode })
        .expect(200);

      // Should have created connection, not a new user
      const users = await ctx.prisma.user.findMany({
        where: { email: 'sso-user@company.dev' },
      });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Existing User'); // name not overwritten

      const connection = await ctx.prisma.ssoConnection.findFirst({
        where: { userId: users[0].id },
      });
      expect(connection).not.toBeNull();
    });

    it('should reject auto-link when provider email is unverified', async () => {
      const provider = await createAndEnableProvider();
      mockGoogle.getUserInfo.mockResolvedValueOnce({
        ...MOCK_USER_INFO,
        emailVerified: false,
      });

      const hash = await bcrypt.hash('existing-pass', 4);
      const victim = await ctx.prisma.user.create({
        data: {
          email: 'sso-user@company.dev',
          name: 'Existing User',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_EMAIL_UNVERIFIED}`,
      );

      const connection = await ctx.prisma.ssoConnection.findFirst({
        where: { userId: victim.id },
      });
      expect(connection).toBeNull();
    });

    it('should reject domain mismatch', async () => {
      const provider = await createAndEnableProvider();

      // Mock user info with wrong domain
      mockGoogle.getUserInfo.mockResolvedValueOnce({
        ...MOCK_USER_INFO,
        email: 'user@wrong-domain.com',
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_DOMAIN_NOT_ALLOWED}`,
      );

      // No user should be created
      const user = await ctx.prisma.user.findFirst({
        where: { email: 'user@wrong-domain.com' },
      });
      expect(user).toBeNull();
    });

    it('should reject blocked user', async () => {
      const provider = await createAndEnableProvider();

      // Create blocked user with SSO connection
      const blockedUser = await ctx.prisma.user.create({
        data: {
          email: 'sso-user@company.dev',
          name: 'Blocked User',
          hasPassword: false,
          role: 'USER',
          isBlocked: true,
        },
      });
      await ctx.prisma.ssoConnection.create({
        data: {
          userId: blockedUser.id,
          providerId: provider.id,
          externalId: MOCK_USER_INFO.sub,
          email: blockedUser.email,
        },
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_USER_BLOCKED}`,
      );
    });

    it('should reject invalid/expired state', async () => {
      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-code', state: 'nonexistent-state-value' })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_INVALID_STATE}`,
      );
    });

    it('should reject callback when provider is disabled', async () => {
      const provider = await createAndEnableProvider();

      // Generate auth URL while enabled
      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      // Disable the provider
      await adminReq()
        .post(`/admin/sso/providers/${provider.id}/disable`)
        .expect(200);

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_PROVIDER_DISABLED}`,
      );
    });
  });

  // ─── Invite-Only Provisioning ─────────────────────────────

  describe('Invite-Only Provisioning', () => {
    it('should create user when valid invite exists', async () => {
      const provider = await createAndEnableProvider({
        provisioningPolicy: 'INVITE_ONLY',
      });

      // Create invite
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await ctx.prisma.invite.create({
        data: {
          email: 'sso-user@company.dev',
          role: 'USER',
          token: 'valid-invite-token',
          status: 'PENDING',
          expiresAt,
          senderId: adminId,
        },
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .query({ inviteToken: 'valid-invite-token' })
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      const finalizeCode = new URL(callbackRes.headers.location).searchParams.get('token')!;
      await request(ctx.app.getHttpServer())
        .post('/auth/sso/finalize')
        .send({ code: finalizeCode })
        .expect(200);

      // User created
      const user = await ctx.prisma.user.findFirst({
        where: { email: 'sso-user@company.dev' },
      });
      expect(user).not.toBeNull();

      // Invite marked as accepted
      const invite = await ctx.prisma.invite.findFirst({
        where: { email: 'sso-user@company.dev' },
      });
      expect(invite!.status).toBe('ACCEPTED');
    });

    it('should reject when no invite exists', async () => {
      const provider = await createAndEnableProvider({
        provisioningPolicy: 'INVITE_ONLY',
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-auth-code', state })
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        `sso_error=${ErrorCode.SSO_NOT_INVITED}`,
      );
    });
  });

  // ─── Finalize ─────────────────────────────────────────────

  describe('Finalize', () => {
    it('should reject expired/reused finalize code', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/sso/finalize')
        .send({ code: 'a'.repeat(64) })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.SSO_FINALIZE_FAILED);
    });
  });

  // ─── Connect / Disconnect ─────────────────────────────────

  describe('Connect & Disconnect', () => {
    it('should connect authenticated user to SSO provider', async () => {
      const provider = await createAndEnableProvider();

      // Admin connects their account to Google
      const res = await adminReq()
        .post(`/auth/sso/${provider.id}/connect`)
        .send({ code: 'mock-connect-code' })
        .expect(200);

      expect(res.body.data.connected).toBe(true);

      // Verify connection in DB
      const connection = await ctx.prisma.ssoConnection.findFirst({
        where: { userId: adminId, providerId: provider.id },
      });
      expect(connection).not.toBeNull();
      expect(connection!.externalId).toBe(MOCK_USER_INFO.sub);
    });

    it('should reject double connection to same provider', async () => {
      const provider = await createAndEnableProvider();

      await adminReq()
        .post(`/auth/sso/${provider.id}/connect`)
        .send({ code: 'mock-code-1' })
        .expect(200);

      const res = await adminReq()
        .post(`/auth/sso/${provider.id}/connect`)
        .send({ code: 'mock-code-2' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.SSO_ALREADY_CONNECTED);
    });

    it('should disconnect when user has a password', async () => {
      const provider = await createAndEnableProvider();

      await adminReq()
        .post(`/auth/sso/${provider.id}/connect`)
        .send({ code: 'mock-code' })
        .expect(200);

      await adminReq()
        .delete(`/auth/sso/${provider.id}/disconnect`)
        .expect(204);

      const connection = await ctx.prisma.ssoConnection.findFirst({
        where: { userId: adminId, providerId: provider.id },
      });
      expect(connection).toBeNull();
    });

    it('should reject disconnect when no password and last connection', async () => {
      const provider = await createAndEnableProvider();

      // Create user without password + with connection
      const ssoUser = await ctx.prisma.user.create({
        data: {
          email: 'nopass@company.dev',
          name: 'No Password',
          hasPassword: false,
          role: 'USER',
        },
      });
      await ctx.prisma.ssoConnection.create({
        data: {
          userId: ssoUser.id,
          providerId: provider.id,
          externalId: 'ext-solo',
          email: ssoUser.email,
        },
      });

      // Login as this SSO user (can't login via password — use admin to test via API)
      // We'll test the service-level behavior by checking the DB response
      // Actually, let's call disconnect as admin impersonating won't work.
      // The endpoint uses @CurrentUser('id'), so we need to be logged in as ssoUser.
      // Since ssoUser has no password, we can't login normally. Let's do a full SSO flow.

      mockGoogle.getUserInfo.mockResolvedValueOnce({
        sub: 'ext-solo',
        email: 'nopass@company.dev',
        emailVerified: true,
        name: 'No Password',
        picture: undefined,
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/auth/sso/${provider.id}/authorize`)
        .expect(302);
      const state = new URL(authRes.headers.location).searchParams.get('state')!;

      const callbackRes = await request(ctx.app.getHttpServer())
        .get('/auth/sso/callback')
        .query({ code: 'mock-code', state })
        .expect(302);

      const finalizeCode = new URL(callbackRes.headers.location).searchParams.get('token')!;
      const finalizeRes = await request(ctx.app.getHttpServer())
        .post('/auth/sso/finalize')
        .send({ code: finalizeCode })
        .expect(200);

      const ssoToken = extractAccessTokenFromCookies(finalizeRes.headers["set-cookie"]);

      const res = await request(ctx.app.getHttpServer())
        .delete(`/auth/sso/${provider.id}/disconnect`)
        .set('Authorization', `Bearer ${ssoToken}`)
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.SSO_DISCONNECT_NO_PASSWORD);
    });

    it('should list user connections', async () => {
      const provider = await createAndEnableProvider();

      await adminReq()
        .post(`/auth/sso/${provider.id}/connect`)
        .send({ code: 'mock-code' })
        .expect(200);

      const res = await adminReq()
        .get('/auth/sso/connections')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].provider.name).toBe('Google SSO');
    });
  });
});
