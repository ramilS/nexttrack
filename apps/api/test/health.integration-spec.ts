import request from 'supertest';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
} from './support/create-e2e-app';

describe('Health Integration (full AppModule)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  describe('GET /health', () => {
    it('should return aggregate health unauthenticated (Public)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toMatch(/^(ok|degraded)$/);
      expect(res.body.data.services).toEqual({
        postgres: expect.stringMatching(/^(ok|down)$/),
        valkey: expect.stringMatching(/^(ok|down)$/),
        elasticsearch: expect.stringMatching(/^(ok|down)$/),
      });
    });

    it('should report postgres ok in test container', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body.data.services.postgres).toBe('ok');
    });
  });

  describe('GET /health/db', () => {
    it('should return 200 when Postgres reachable', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/health/db')
        .expect(200);

      expect(res.body.data).toEqual({ status: 'ok', service: 'postgres' });
    });
  });

  describe('GET /health/valkey', () => {
    it('should return 200 when Redis reachable', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/health/valkey')
        .expect(200);

      expect(res.body.data).toEqual({ status: 'ok', service: 'valkey' });
    });
  });

  describe('GET /health/es', () => {
    it('should return 200 or 503 for ES (depends on test container availability)', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/health/es');
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data).toEqual({ status: 'ok', service: 'elasticsearch' });
      }
    });
  });
});
