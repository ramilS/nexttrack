import { TEST_SECRETS } from '@repo/test-support';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@repo/test-support/containers';
import { execSync } from 'child_process';

declare global {
  var __TESTCONTAINERS__: {
    pgContainer: StartedPostgreSqlContainer;
    redisContainer: StartedRedisContainer;
  };
}

export default async function globalSetup(): Promise<void> {
  console.log('\n🐳 Starting shared test containers (PostgreSQL + Redis)...');
  const startTime = Date.now();

  const [pgContainer, redisContainer] = await Promise.all([
    startPostgres(),
    startRedis(),
  ]);

  const dbUrl = pgContainer.getConnectionUri();
  const redisUrl = redisContainer.getConnectionUrl();

  // Set env vars — inherited by Jest worker processes
  process.env.DATABASE_URL = dbUrl;
  process.env.VALKEY_URL = redisUrl;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = TEST_SECRETS.jwtAccessSecret;
  process.env.JWT_REFRESH_SECRET = TEST_SECRETS.jwtRefreshSecret;
  process.env.ENCRYPTION_KEY = TEST_SECRETS.encryptionKey;
  // Inert: S3 is mocked in integration, but storage.config requires these at boot.
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_ACCESS_KEY = TEST_SECRETS.s3AccessKey;
  process.env.S3_SECRET_KEY = TEST_SECRETS.s3SecretKey;
  process.env.MIGRATION_API_SECRET = TEST_SECRETS.migrationApiSecret;

  // Push Prisma schema once
  execSync('npx prisma db push --force-reset', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'да',
    },
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // Store container refs for teardown
  globalThis.__TESTCONTAINERS__ = { pgContainer, redisContainer };

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Containers ready in ${elapsed}s (DB: ${dbUrl})`);
}
