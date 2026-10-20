import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  OpenSearchContainer,
  StartedOpenSearchContainer,
} from '@testcontainers/opensearch';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { TEST_SECRETS } from './index';

export type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
export type { StartedRedisContainer } from '@testcontainers/redis';
export type { StartedOpenSearchContainer } from '@testcontainers/opensearch';
export type { StartedTestContainer } from 'testcontainers';

const TEST_IMAGES = {
  postgres: 'postgres:18-alpine',
  // Must stay org-prefixed (`valkey/valkey:...`) or testcontainers can't pull it.
  redis: 'valkey/valkey:9.1.0-alpine',
  searchEngine: 'opensearchproject/opensearch:3.6.0',
  objectStorage: 'dxflrs/garage:v2.4.1',
} as const;

export function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(TEST_IMAGES.postgres)
    .withDatabase('nexttrack_test')
    .withUsername('test')
    .withPassword('test')
    // High max_connections: integration runs the app in-process, sharing one
    // Postgres between the app pool, background bursts, and the test's queries.
    .withCommand([
      'postgres',
      '-c', 'max_connections=200',
      '-c', 'idle_in_transaction_session_timeout=5000',
    ])
    .start();
}

export function startRedis(): Promise<StartedRedisContainer> {
  return new RedisContainer(TEST_IMAGES.redis).start();
}

export async function startSearchEngine(): Promise<StartedOpenSearchContainer> {
  const container = await new OpenSearchContainer(TEST_IMAGES.searchEngine)
    // Security off keeps the endpoint plain http with no admin credentials,
    // matching how the app connects in dev and CI.
    .withSecurityEnabled(false)
    .withEnvironment({
      // 512m heap: 256m caused GC stalls past the client's 5s requestTimeout →
      // the single node was marked dead (NoLivingConnectionsError) and indexing
      // jobs failed. Matches the prod compose heap.
      OPENSEARCH_JAVA_OPTS: '-Xms512m -Xmx512m',
      // The performance-analyzer plugin costs memory this single-node test
      // cluster has no use for.
      DISABLE_INSTALL_DEMO_CONFIG: 'true',
    })
    .start();

  // The container's wait strategy only checks that the HTTP port answers, but
  // the cluster briefly rejects index ops after that. If the app's first engine
  // call (onModuleInit's index create) lands in that window it fails, and the
  // client benches the sole node for its ~60s resurrect timeout — every
  // indexing job then fails with NoLivingConnectionsError, far longer than the
  // search tests poll. Block until the cluster is at least yellow first.
  await waitForClusterReady(
    `http://${container.getHost()}:${container.getMappedPort(9200)}`,
  );

  return container;
}

async function waitForClusterReady(baseUrl: string): Promise<void> {
  const url = `${baseUrl}/_cluster/health?wait_for_status=yellow&timeout=5s`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === 'yellow' || body.status === 'green') return;
      }
    } catch {
      // Engine not accepting connections yet — retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`OpenSearch at ${baseUrl} never reached yellow status`);
}

export const OBJECT_STORAGE_REGION = 'garage';
export const OBJECT_STORAGE_S3_PORT = 3900;
const OBJECT_STORAGE_ADMIN_PORT = 3903;

// Mirrors infra/garage/garage.toml minus persistence: the container is thrown
// away after the run, so metadata and data live in its own filesystem.
const GARAGE_TEST_CONFIG = `
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"

[s3_api]
s3_region = "${OBJECT_STORAGE_REGION}"
api_bind_addr = "[::]:${OBJECT_STORAGE_S3_PORT}"

[admin]
api_bind_addr = "[::]:${OBJECT_STORAGE_ADMIN_PORT}"
`;

export function startObjectStorage(): Promise<StartedTestContainer> {
  return new GenericContainer(TEST_IMAGES.objectStorage)
    .withCopyContentToContainer([
      { content: GARAGE_TEST_CONFIG, target: '/etc/garage.toml' },
    ])
    .withEnvironment({
      GARAGE_RPC_SECRET: '0'.repeat(64),
      GARAGE_DEFAULT_ACCESS_KEY: TEST_SECRETS.s3AccessKey,
      GARAGE_DEFAULT_SECRET_KEY: TEST_SECRETS.s3SecretKey,
    })
    .withCommand(['/garage', 'server', '--single-node', '--default-access-key'])
    .withExposedPorts(OBJECT_STORAGE_S3_PORT, OBJECT_STORAGE_ADMIN_PORT)
    // The layout and the access key are written before the S3 and admin
    // servers start listening, so a healthy node is ready to serve the API.
    .withWaitStrategy(Wait.forHttp('/health', OBJECT_STORAGE_ADMIN_PORT))
    .start();
}
