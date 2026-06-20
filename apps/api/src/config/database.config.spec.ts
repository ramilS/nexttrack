import { databaseConfig } from './database.config';

describe('databaseConfig', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
    delete process.env.DATABASE_IDLE_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults connection and idle timeouts when env is unset', () => {
    const config = databaseConfig();

    expect(config.connectionTimeoutMs).toBe(10_000);
    expect(config.idleTimeoutMs).toBe(30_000);
  });

  it('coerces timeout env vars from strings', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT_MS = '5000';
    process.env.DATABASE_IDLE_TIMEOUT_MS = '0';

    const config = databaseConfig();

    expect(config.connectionTimeoutMs).toBe(5_000);
    expect(config.idleTimeoutMs).toBe(0);
  });

  it('rejects a connection timeout above the upper bound', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT_MS = '60001';

    expect(() => databaseConfig()).toThrow();
  });

  it('rejects a negative idle timeout', () => {
    process.env.DATABASE_IDLE_TIMEOUT_MS = '-1';

    expect(() => databaseConfig()).toThrow();
  });
});
