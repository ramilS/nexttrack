import { storageConfig } from './storage.config';

describe('storageConfig', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.S3_ENDPOINT = 'http://garage:3900';
    process.env.S3_ACCESS_KEY = 'nexttrack-dev';
    process.env.S3_SECRET_KEY = 'nexttrack-dev-secret';
    delete process.env.S3_PORT;
    delete process.env.S3_USE_SSL;
    delete process.env.ATTACHMENT_CACHE_MAX_AGE_SECONDS;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('keeps a full endpoint URL as given', () => {
    expect(storageConfig().endpoint).toBe('http://garage:3900');
  });

  it('builds the URL from a bare host, port and S3_USE_SSL', () => {
    process.env.S3_ENDPOINT = 'garage';
    process.env.S3_PORT = '3900';
    process.env.S3_USE_SSL = 'true';

    expect(storageConfig().endpoint).toBe('https://garage:3900');
  });

  it('rejects a missing S3_ENDPOINT instead of connecting to "http://undefined"', () => {
    delete process.env.S3_ENDPOINT;

    expect(() => storageConfig()).toThrow();
  });

  it('rejects a non-http(s) endpoint', () => {
    process.env.S3_ENDPOINT = 'ftp://garage:3900';

    expect(() => storageConfig()).toThrow();
  });

  it('defaults the attachment cache max-age and coerces it from env', () => {
    expect(storageConfig().cacheMaxAgeSeconds).toBe(60);

    process.env.ATTACHMENT_CACHE_MAX_AGE_SECONDS = '0';
    expect(storageConfig().cacheMaxAgeSeconds).toBe(0);
  });

  it.each(['-1', '86401', '1.5'])('rejects cache max-age %s', (value) => {
    process.env.ATTACHMENT_CACHE_MAX_AGE_SECONDS = value;

    expect(() => storageConfig()).toThrow();
  });
});
