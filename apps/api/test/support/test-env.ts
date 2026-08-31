/**
 * Per-worker resource addressing for the integration suite.
 *
 * The suite runs several Jest workers in parallel, and every worker resets its
 * database with `TRUNCATE` between test cases — so workers must not share one.
 * `globalSetup` provisions a database per worker plus a Valkey logical database
 * per worker, and this module is the single place that derives their addresses
 * from `JEST_WORKER_ID`. Nothing else should build these URLs by hand.
 */

/** Base container URLs, published by `globalSetup` for the workers to derive from. */
export const BASE_DATABASE_URL_ENV = 'TEST_BASE_DATABASE_URL';
export const BASE_VALKEY_URL_ENV = 'TEST_BASE_VALKEY_URL';

const WORKER_DATABASE_PREFIX = 'nexttrack_test_w';

/**
 * Valkey ships with 16 logical databases (`databases 16`), and worker ids are
 * 1-based, so index 0 stays free for anything that needs the default.
 */
export const MAX_WORKERS = 15;

function currentWorkerId(): number {
  // Jest sets JEST_WORKER_ID in worker processes; it is absent when a file is
  // run in-band (`--runInBand`), where worker 1 is the only worker there is.
  const raw = process.env.JEST_WORKER_ID;
  const id = raw ? Number(raw) : 1;
  if (!Number.isInteger(id) || id < 1 || id > MAX_WORKERS) {
    throw new Error(
      `JEST_WORKER_ID=${String(raw)} is out of the supported range 1..${MAX_WORKERS}`,
    );
  }
  return id;
}

export function workerDatabaseName(workerId: number): string {
  return `${WORKER_DATABASE_PREFIX}${workerId}`;
}

function requireBaseUrl(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new Error(
      `${envName} is not set. Ensure globalSetup has run (jest --config test/jest-integration.json).`,
    );
  }
  return value;
}

export function workerDatabaseUrl(workerId = currentWorkerId()): string {
  const url = new URL(requireBaseUrl(BASE_DATABASE_URL_ENV));
  url.pathname = `/${workerDatabaseName(workerId)}`;
  return url.toString();
}

export function workerValkeyUrl(workerId = currentWorkerId()): string {
  // ioredis reads the logical database from the URL path, but only for the
  // `redis:`/`rediss:` schemes — for anything else the path is taken as a unix
  // socket. The container hands out `redis://…`, so assert rather than assume.
  const base = requireBaseUrl(BASE_VALKEY_URL_ENV).replace(/\/+$/, '');
  if (!/^rediss?:\/\//.test(base)) {
    throw new Error(
      `${BASE_VALKEY_URL_ENV} must use the redis:// or rediss:// scheme to carry a database index, got ${base}`,
    );
  }
  return `${base}/${workerId}`;
}
