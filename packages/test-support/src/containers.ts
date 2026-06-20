import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  ElasticsearchContainer,
  StartedElasticsearchContainer,
} from '@testcontainers/elasticsearch';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { TEST_SECRETS } from './index';

export type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
export type { StartedRedisContainer } from '@testcontainers/redis';
export type { StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
export type { StartedTestContainer } from 'testcontainers';

const TEST_IMAGES = {
  postgres: 'postgres:18-alpine',
  // Must stay org-prefixed (`valkey/valkey:...`) or testcontainers can't pull it.
  redis: 'valkey/valkey:9.1.0-alpine',
  elasticsearch: 'docker.elastic.co/elasticsearch/elasticsearch:9.4.2',
  minio: 'minio/minio:latest',
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

export function startElasticsearch(): Promise<StartedElasticsearchContainer> {
  return new ElasticsearchContainer(TEST_IMAGES.elasticsearch)
    .withEnvironment({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms256m -Xmx256m',
    })
    .start();
}

export function startMinio(): Promise<StartedTestContainer> {
  return new GenericContainer(TEST_IMAGES.minio)
    .withEnvironment({
      MINIO_ROOT_USER: TEST_SECRETS.s3AccessKey,
      MINIO_ROOT_PASSWORD: TEST_SECRETS.s3SecretKey,
    })
    .withExposedPorts(9000)
    .withCommand(['server', '/data'])
    .start();
}
