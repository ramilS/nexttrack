import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { applyTrustProxy } from './configure-app';
import { appConfig, AppConfig } from '@/config';

function baseAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 3001,
    apiUrl: 'http://localhost:3001',
    webUrl: 'http://localhost:3000',
    requestTimeoutMs: 30_000,
    swaggerEnabled: false,
    trustProxy: false,
    ...overrides,
  };
}

@Module({})
class EmptyModule {}

async function buildApp(config: AppConfig) {
  const moduleRef = await Test.createTestingModule({
    imports: [EmptyModule],
    providers: [{ provide: appConfig.KEY, useValue: config }],
  }).compile();

  return moduleRef.createNestApplication();
}

describe('applyTrustProxy', () => {
  it('leaves Express’s "trust proxy" at its own default (false) when unconfigured', async () => {
    const app = await buildApp(baseAppConfig({ trustProxy: false }));
    applyTrustProxy(app);

    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
    await app.close();
  });

  it('passes a configured hop count through to the underlying Express instance', async () => {
    const app = await buildApp(baseAppConfig({ trustProxy: 1 }));
    applyTrustProxy(app);

    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);
    await app.close();
  });

  it('passes a configured boolean through to the underlying Express instance', async () => {
    const app = await buildApp(baseAppConfig({ trustProxy: true }));
    applyTrustProxy(app);

    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(true);
    await app.close();
  });
});
