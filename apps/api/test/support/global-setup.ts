import { TEST_SECRETS } from '@repo/test-support';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@repo/test-support/containers';
import { execSync } from 'child_process';
import { Client } from 'pg';
import {
  BASE_DATABASE_URL_ENV,
  BASE_VALKEY_URL_ENV,
  MAX_WORKERS,
  workerDatabaseName,
  workerDatabaseUrl,
} from './test-env';

declare global {
  var __TESTCONTAINERS__: {
    pgContainer: StartedPostgreSqlContainer;
    redisContainer: StartedRedisContainer;
  };
}

/**
 * Only the fields this setup reads. Typing the parameter structurally keeps
 * `@jest/types` out of the dependency list for one property.
 */
interface JestGlobalConfig {
  maxWorkers?: number;
}

/**
 * `CREATE DATABASE … TEMPLATE` copies the template's files, so each worker gets
 * the pushed schema without paying for its own `prisma db push`. The template
 * must have no open connections, which is why this runs from the `postgres`
 * maintenance database after the Prisma CLI processes have exited.
 */
async function provisionWorkerDatabases(
  baseUrl: string,
  workerCount: number,
): Promise<void> {
  const maintenanceUrl = new URL(baseUrl);
  const templateName = maintenanceUrl.pathname.replace(/^\//, '');
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    // The Prisma CLI processes have exited, but Postgres can take a moment to
    // reap their backends — and `CREATE DATABASE ... TEMPLATE` refuses while any
    // connection to the template is still open. Close them explicitly.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [templateName],
    );

    for (let workerId = 1; workerId <= workerCount; workerId++) {
      const name = workerDatabaseName(workerId);
      await client.query(`DROP DATABASE IF EXISTS "${name}"`);
      await client.query(`CREATE DATABASE "${name}" TEMPLATE "${templateName}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(
  globalConfig: JestGlobalConfig = {},
): Promise<void> {
  console.log('\n🐳 Starting shared test containers (PostgreSQL + Redis)...');
  const startTime = Date.now();

  const [pgContainer, redisContainer] = await Promise.all([
    startPostgres(),
    startRedis(),
  ]);

  const baseDbUrl = pgContainer.getConnectionUri();
  const baseRedisUrl = redisContainer.getConnectionUrl();

  // Set env vars — inherited by Jest worker processes. Each worker narrows
  // these to its own database via `test-env.ts`; the base URLs stay available
  // for schema provisioning here.
  process.env[BASE_DATABASE_URL_ENV] = baseDbUrl;
  process.env[BASE_VALKEY_URL_ENV] = baseRedisUrl;
  process.env.DATABASE_URL = baseDbUrl;
  process.env.VALKEY_URL = baseRedisUrl;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = TEST_SECRETS.jwtAccessSecret;
  process.env.JWT_REFRESH_SECRET = TEST_SECRETS.jwtRefreshSecret;
  process.env.ENCRYPTION_KEY = TEST_SECRETS.encryptionKey;
  // Inert: S3 is mocked in integration, but storage.config requires these at boot.
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_ACCESS_KEY = TEST_SECRETS.s3AccessKey;
  process.env.S3_SECRET_KEY = TEST_SECRETS.s3SecretKey;
  process.env.MIGRATION_API_SECRET = TEST_SECRETS.migrationApiSecret;

  // Push Prisma schema once, into the template database
  execSync('npx prisma db push --force-reset', {
    env: {
      ...process.env,
      DATABASE_URL: baseDbUrl,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'да',
    },
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // `db push` does not create migration-only partial indexes. The dedup race
  // test depends on this one, so create it explicitly or that test is vacuous.
  //
  // Prisma 7's `db execute` reads its datasource exclusively from
  // prisma.config.ts (which resolves `DATABASE_URL` from the environment) —
  // there is no `--url` flag, unlike older Prisma CLIs. Passing `DATABASE_URL`
  // in `env` below is what actually points it at the ephemeral container.
  execSync('npx prisma db execute --stdin', {
    env: {
      ...process.env,
      DATABASE_URL: baseDbUrl,
    },
    cwd: process.cwd(),
    input:
      'CREATE UNIQUE INDEX IF NOT EXISTS "issues_project_dedup_key_unique" ' +
      'ON "issues" ("project_id", "dedup_key") WHERE "deleted_at" IS NULL;',
    stdio: 'pipe',
  });

  // Clone the schema once per worker. Workers truncate between test cases, so a
  // shared database is what forced the suite to run single-threaded.
  const workerCount = Math.max(globalConfig.maxWorkers ?? 1, 1);
  if (workerCount > MAX_WORKERS) {
    // Fail here, once and clearly, rather than in whichever specs happen to land
    // on a worker with no database of its own.
    throw new Error(
      `maxWorkers=${workerCount} exceeds the supported ${MAX_WORKERS}: each worker needs its own Valkey logical database, and Valkey ships with 16. Lower --maxWorkers.`,
    );
  }
  await provisionWorkerDatabases(baseDbUrl, workerCount);

  // Store container refs for teardown
  globalThis.__TESTCONTAINERS__ = { pgContainer, redisContainer };

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `✅ Containers ready in ${elapsed}s (${workerCount} worker database(s), e.g. ${workerDatabaseUrl(1)})`,
  );
}
