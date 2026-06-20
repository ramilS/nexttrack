import request from 'supertest';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
} from './support/create-e2e-app';

// Guards the prod ⇄ test bootstrap parity: the integration harness must apply
// the same request-pipeline middleware (`configureApp`) the API runs in
// production, so behavior that rides on it — the request id in the error
// envelope, helmet security headers — is actually exercised by tests rather
// than silently diverging. The `/api` global prefix is intentionally NOT part
// of this parity (deployment-only routing concern), so paths here stay bare.
describe('Bootstrap parity (prod ⇄ test harness)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  it('applies helmet security headers', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('threads the request id into the response header and the error envelope', async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      '/route-that-does-not-exist-parity-check',
    );

    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.body.error?.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
  });
});
