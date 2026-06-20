import { AuthConfig } from '../../src/config/auth.config';
import { AppConfig } from '../../src/config/app.config';
import { SsoConfig } from '../../src/config/sso.config';

export const mockAuthConfig: AuthConfig = {
  accessSecret: 'test-access-secret-long-enough',
  refreshSecret: 'test-refresh-secret-long-enough',
  accessExpiresIn: '15m',
  refreshExpiresInDays: 7,
  inviteTtlHours: 72,
  localEnabled: true,
};

export const mockAppConfig: AppConfig = {
  nodeEnv: 'test',
  swaggerEnabled: false,
  port: 3001,
  apiUrl: 'http://localhost:3001',
  webUrl: 'http://localhost:3000',
  requestTimeoutMs: 30_000,
};

export const mockSsoConfig: SsoConfig = {
  encryptionKey: 'a'.repeat(64),
  stateTtl: 600,
  finalizeCodeTtl: 300,
};
