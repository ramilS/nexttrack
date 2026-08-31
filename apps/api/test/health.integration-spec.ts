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
        searchEngine: expect.stringMatching(/^(ok|down)$/),
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

  describe('GET /health/search-engine', () => {
    it('should report the search engine as ok', async () => {
      // This harness runs with the mocked engine, whose `ping()` resolves — so
      // 200 is the contract here, not a coin flip on container availability.
      const res = await request(ctx.app.getHttpServer())
        .get('/health/search-engine')
        .expect(200);

      expect(res.body.data).toEqual({ status: 'ok', service: 'searchEngine' });
    });
  });
});
