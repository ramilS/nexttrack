import { FullConfig } from '@playwright/test';
import { TEST_SECRETS } from '@repo/test-support';
import {
  startElasticsearch,
  startMinio,
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
  type StartedElasticsearchContainer,
  type StartedTestContainer,
} from '@repo/test-support/containers';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { type E2eFileState, setProcessState } from '@helpers/e2e-state';

const ROOT = path.resolve(__dirname, '../..');
const API_DIR = path.resolve(ROOT, 'apps/api');
const WEB_DIR = path.resolve(ROOT, 'apps/web');
const ENV_FILE = path.resolve(__dirname, '.env.e2e');
const STATE_FILE = path.resolve(__dirname, '.e2e-state.json');

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not get free port'));
      }
    });
    server.on('error', reject);
  });
}

async function waitForUrl(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url} (${timeoutMs}ms)`);
}

function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): ChildProcess {
  const label = path.basename(cwd);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[${label}] ${msg}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[${label}] ${msg}`);
  });

  child.on('error', (err) => {
    console.error(`[${label}] Process error: ${err.message}`);
  });

  return child;
}

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let esContainer: StartedElasticsearchContainer;
let minioContainer: StartedTestContainer;

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // E2E runs built artifacts (api/dist, web/.next) — rebuild so tests never
  // exercise a stale build. Turbo cache makes this a no-op when fresh.
  console.log('\n[e2e] Building api + web...');
  execSync('npx turbo run build --filter=api --filter=web', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log('\n[e2e] Starting infrastructure...');

  // 1. Start containers in parallel
  [pgContainer, redisContainer, esContainer, minioContainer] = await Promise.all([
    startPostgres(),
    startRedis(),
    startElasticsearch(),
    startMinio(),
  ]);

  const dbUrl = pgContainer.getConnectionUri();
  const redisUrl = redisContainer.getConnectionUrl();
  const esUrl = `http://${esContainer.getHost()}:${esContainer.getMappedPort(9200)}`;
  const minioUrl = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
  console.log(`[e2e] PostgreSQL: ${dbUrl}`);
  console.log(`[e2e] Redis: ${redisUrl}`);
  console.log(`[e2e] Elasticsearch: ${esUrl}`);
  console.log(`[e2e] MinIO: ${minioUrl}`);

  // 2. Push Prisma schema
  console.log('[e2e] Pushing Prisma schema...');
  execSync('npx prisma db push --force-reset', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'да',
    },
    cwd: API_DIR,
    stdio: 'pipe',
  });

  // 3. Seed test data
  console.log('[e2e] Seeding test data...');
  execSync('npx tsx prisma/seed-dev.ts', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
    },
    cwd: API_DIR,
    stdio: 'pipe',
    timeout: 120_000,
  });

  // 4. Get free ports — both dynamic (proxy.ts reads INTERNAL_API_URL at runtime)
  const [apiPort, webPort] = await Promise.all([getFreePort(), getFreePort()]);
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;

  // Common env vars for NestJS
  const apiEnv: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    DATABASE_URL: dbUrl,
    REDIS_URL: redisUrl,
    API_PORT: String(apiPort),
    API_URL: apiUrl,
    WEB_URL: webUrl,
    JWT_ACCESS_SECRET: TEST_SECRETS.jwtAccessSecret,
    JWT_REFRESH_SECRET: TEST_SECRETS.jwtRefreshSecret,
    ENCRYPTION_KEY: TEST_SECRETS.encryptionKey,
    S3_ENDPOINT: minioUrl,
    S3_ACCESS_KEY: TEST_SECRETS.s3AccessKey,
    S3_SECRET_KEY: TEST_SECRETS.s3SecretKey,
    S3_BUCKET: 'test-bucket',
    MIGRATION_API_SECRET: TEST_SECRETS.migrationApiSecret,
    ELASTICSEARCH_URL: esUrl,
    WS_ADAPTER: 'memory',
    WS_CORS_ORIGINS: webUrl,
    AUTH_LOCAL_ENABLED: 'true',
    OUTBOX_POLLER_ENABLED: 'true',
    OUTBOX_POLL_INTERVAL_MS: '250',
    THROTTLE_TTL: '60',
    THROTTLE_LIMIT: '300',
    MAIL_HOST: 'localhost',
    MAIL_PORT: '1025',
    MAIL_FROM: 'test@test.com',
  };

  // 5. Start NestJS API
  console.log(`[e2e] Starting NestJS API on port ${apiPort}...`);
  const apiProcess = spawnProcess(
    'node',
    ['dist/main.js'],
    API_DIR,
    apiEnv,
  );

  // 6. Start Next.js Web
  console.log(`[e2e] Starting Next.js on port ${webPort}...`);
  const webEnv: Record<string, string> = {
    PORT: String(webPort),
    INTERNAL_API_URL: apiUrl,
    HOSTNAME: '0.0.0.0',
  };

  // Use standalone output if available, otherwise next start
  const standalonePath = path.resolve(WEB_DIR, '.next/standalone');
  let webProcess: ChildProcess;

  if (fs.existsSync(path.resolve(standalonePath, 'apps/web/server.js'))) {
    // Standalone mode requires static files to be copied manually
    const standaloneStaticDir = path.resolve(standalonePath, 'apps/web/.next/static');
    const sourceStaticDir = path.resolve(WEB_DIR, '.next/static');
    if (!fs.existsSync(standaloneStaticDir) && fs.existsSync(sourceStaticDir)) {
      fs.mkdirSync(path.resolve(standalonePath, 'apps/web/.next'), { recursive: true });
      fs.cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });
      console.log('[e2e] Copied .next/static to standalone');
    }

    // Copy public dir if exists
    const standalonePublicDir = path.resolve(standalonePath, 'apps/web/public');
    const sourcePublicDir = path.resolve(WEB_DIR, 'public');
    if (!fs.existsSync(standalonePublicDir) && fs.existsSync(sourcePublicDir)) {
      fs.cpSync(sourcePublicDir, standalonePublicDir, { recursive: true });
      console.log('[e2e] Copied public to standalone');
    }

    webProcess = spawnProcess(
      'node',
      ['apps/web/server.js'],
      standalonePath,
      webEnv,
    );
  } else {
    webProcess = spawnProcess(
      'npx',
      ['next', 'start', '-p', String(webPort)],
      WEB_DIR,
      webEnv,
    );
  }

  // 7. Wait for both servers to be ready
  console.log('[e2e] Waiting for servers...');
  await Promise.all([
    waitForUrl(`${apiUrl}/api/health`, 60_000),
    waitForUrl(webUrl, 90_000),
  ]);
  console.log('[e2e] Both servers are ready!');

  // 8. Reindex Elasticsearch so issue list works
  console.log('[e2e] Reindexing Elasticsearch...');
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nexttrack.local', password: 'Password123!' }),
  });
  // access_token is delivered as an httpOnly cookie, not in the body.
  const setCookie = loginRes.headers.get('set-cookie');
  const tokenMatch = setCookie?.match(/(?:^|;|,\s*)access_token=([^;]+)/);
  const adminToken = tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : undefined;
  if (adminToken) {
    const reindexRes = await fetch(`${apiUrl}/api/search/reindex`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    console.log(`[e2e] Reindex: ${reindexRes.status}`);
  } else {
    console.warn('[e2e] Could not obtain admin token for reindex');
  }

  // 9. Save env file for Playwright config
  fs.writeFileSync(ENV_FILE, `API_URL=${apiUrl}\nWEB_URL=${webUrl}\n`);

  // 9. Save state for teardown (file-based fallback)
  const state: E2eFileState = {
    pgContainerId: pgContainer.getId(),
    redisContainerId: redisContainer.getId(),
    esContainerId: esContainer.getId(),
    apiPid: apiProcess.pid!,
    webPid: webProcess.pid!,
    apiUrl,
    webUrl,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // Store references for teardown (same-process)
  setProcessState({ pgContainer, redisContainer, esContainer, minioContainer, apiProcess, webProcess });
}
