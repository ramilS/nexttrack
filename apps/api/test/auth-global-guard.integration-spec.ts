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

describe('Global JwtAuthGuard + soft-delete JWT (Integration)', () => {
  let ctx: E2eContext;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('userpass1!', 4);
    const user = await ctx.prisma.user.create({
      data: {
        email: 'user@test.local',
        name: 'User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });
    userId = user.id;

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.local', password: 'userpass1!' })
      .expect(200);
    userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);
  });

  describe('global guard', () => {
    it('rejects unauthenticated request to a protected endpoint with 401', async () => {
      await request(ctx.app.getHttpServer())
        .get('/projects')
        .expect(401);
    });

    it('accepts authenticated request to the same endpoint', async () => {
      await request(ctx.app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('still allows @Public() endpoints without a token', async () => {
      await request(ctx.app.getHttpServer())
        .get('/auth/methods')
        .expect(200);

      await request(ctx.app.getHttpServer())
        .get('/health')
        .expect(200);
    });
  });

  describe('soft-delete revokes existing JWT', () => {
    it('rejects requests after the user has been soft-deleted', async () => {
      // Token was issued *before* delete, still inside its 15-minute TTL.
      await request(ctx.app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      await ctx.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      await request(ctx.app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    });
  });
});
