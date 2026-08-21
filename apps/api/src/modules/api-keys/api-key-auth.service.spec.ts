import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { GlobalRole, UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysRepository, ApiKeyPrincipalRow } from './api-keys.repository';
import { hashApiKey } from './api-key-token';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { apiKeyAuthConfig } from '@/config';
import type { IntegrationRequest } from '@/common/http/integration-request';

const RAW = 'nt_test_key_value';
const IP = '203.0.113.7';

function principal(overrides: Partial<ApiKeyPrincipalRow> = {}): ApiKeyPrincipalRow {
  return {
    id: 'key-1',
    userId: 'svc-1',
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    user: {
      id: 'svc-1',
      email: 'svc.abc@integrations.invalid',
      name: 'MyTracker',
      avatarUrl: null,
      role: GlobalRole.USER,
      kind: UserKind.SERVICE,
      isBlocked: false,
      deletedAt: null,
    },
    ...overrides,
  };
}

/** A stateless mock: each method resolves to whatever the test set most
 * recently, so tests can drive the pre-DB counter check independently of
 * the increment path. Defaults model an unthrottled, healthy Valkey. */
function buildValkeyMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ValkeyService>;
}

async function buildService(rateLimit = { failedAttemptsLimit: 20, failedAttemptsWindowSeconds: 60 }) {
  const repo = {
    findActiveByHash: jest.fn().mockResolvedValue(principal()),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ApiKeysRepository>;
  const background = { run: jest.fn() };
  const valkey = buildValkeyMock();
  const req = { headers: {}, ip: IP } as IntegrationRequest;

  const moduleRef = await Test.createTestingModule({
    providers: [
      ApiKeyAuthService,
      { provide: ApiKeysRepository, useValue: repo },
      { provide: BackgroundTasks, useValue: background },
      { provide: ValkeyService, useValue: valkey },
      { provide: apiKeyAuthConfig.KEY, useValue: rateLimit },
    ],
  }).compile();

  return { service: moduleRef.get(ApiKeyAuthService), repo, background, valkey, req };
}

describe('ApiKeyAuthService', () => {
  let service: ApiKeyAuthService;
  let repo: jest.Mocked<ApiKeysRepository>;
  let background: { run: jest.Mock };
  let req: IntegrationRequest;

  beforeEach(async () => {
    ({ service, repo, background, req } = await buildService());
  });

  it('looks the key up by hash, never by the raw value', async () => {
    await service.authenticate(req, RAW);
    expect(repo.findActiveByHash).toHaveBeenCalledWith(hashApiKey(RAW));
  });

  it('populates the request principal and key id on success', async () => {
    await expect(service.authenticate(req, RAW)).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: 'svc-1', kind: UserKind.SERVICE });
    expect(req.apiKeyId).toBe('key-1');
  });

  it.each([
    ['unknown key', null],
    ['revoked key', principal({ revokedAt: new Date('2020-01-01') })],
    ['expired key', principal({ expiresAt: new Date('2020-01-01') })],
    ['blocked principal', principal({ user: { ...principal().user, isBlocked: true } })],
    ['deleted principal', principal({ user: { ...principal().user, deletedAt: new Date() } })],
    ['human principal', principal({ user: { ...principal().user, kind: UserKind.HUMAN } })],
  ])('rejects a %s with an indistinguishable error', async (_label, row) => {
    repo.findActiveByHash.mockResolvedValue(row);

    await expect(service.authenticate(req, RAW)).rejects.toThrow(UnauthorizedException);
    // NestJS wraps a string ctor arg into `{ statusCode, message, error }`; the
    // ErrorCode always surfaces as `.message`, which is what AllExceptionsFilter
    // reads to build the client-facing `error.code`.
    await expect(service.authenticate(req, RAW)).rejects.toMatchObject({
      message: ErrorCode.API_KEY_INVALID,
    });
    expect(req.user).toBeUndefined();
  });

  it('touches lastUsedAt through BackgroundTasks, not inline', async () => {
    await service.authenticate(req, RAW);
    expect(background.run).toHaveBeenCalled();
    expect(repo.touchLastUsed).not.toHaveBeenCalled();
  });

  it('does not touch lastUsedAt again inside the throttle window', async () => {
    repo.findActiveByHash.mockResolvedValue(principal({ lastUsedAt: new Date() }));
    await service.authenticate(req, RAW);
    expect(background.run).not.toHaveBeenCalled();
  });

  it('short-circuits a second pass against the same request (JwtAuthGuard runs twice per request)', async () => {
    await service.authenticate(req, RAW);
    await service.authenticate(req, RAW);

    expect(repo.findActiveByHash).toHaveBeenCalledTimes(1);
    expect(background.run).toHaveBeenCalledTimes(1);
  });
});

describe('ApiKeyAuthService — failed-attempt rate limiting', () => {
  const LIMIT = 20;
  const WINDOW = 60;

  it('reads the failed-attempt counter before doing any DB lookup', async () => {
    const { service, repo, valkey, req } = await buildService({
      failedAttemptsLimit: LIMIT,
      failedAttemptsWindowSeconds: WINDOW,
    });
    valkey.get.mockResolvedValue(String(LIMIT));

    await service.authenticate(req, RAW).catch(() => undefined);

    expect(valkey.get).toHaveBeenCalledWith(`apikeyauth:fail:${IP}`);
    expect(repo.findActiveByHash).not.toHaveBeenCalled();
  });

  it('lets a request one under the threshold reach the DB lookup', async () => {
    const { service, repo, valkey, req } = await buildService({
      failedAttemptsLimit: LIMIT,
      failedAttemptsWindowSeconds: WINDOW,
    });
    repo.findActiveByHash.mockResolvedValue(null);
    valkey.get.mockResolvedValue(String(LIMIT - 1));

    await expect(service.authenticate(req, RAW)).rejects.toMatchObject({
      message: ErrorCode.API_KEY_INVALID,
    });
    expect(repo.findActiveByHash).toHaveBeenCalled();
  });

  it('blocks a request exactly at the threshold with 429, without touching the DB', async () => {
    const { service, repo, valkey, req } = await buildService({
      failedAttemptsLimit: LIMIT,
      failedAttemptsWindowSeconds: WINDOW,
    });
    valkey.get.mockResolvedValue(String(LIMIT));

    const rejection = service.authenticate(req, RAW);
    await expect(rejection).rejects.toBeInstanceOf(HttpException);
    await expect(rejection).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: ErrorCode.RATE_LIMITED },
    });
    expect(repo.findActiveByHash).not.toHaveBeenCalled();
  });

  it('increments the counter and arms the window TTL on the first failure', async () => {
    const { service, repo, valkey, req } = await buildService({
      failedAttemptsLimit: LIMIT,
      failedAttemptsWindowSeconds: WINDOW,
    });
    repo.findActiveByHash.mockResolvedValue(null);
    valkey.get.mockResolvedValue(null);
    valkey.incr.mockResolvedValue(1);

    await service.authenticate(req, RAW).catch(() => undefined);

    expect(valkey.incr).toHaveBeenCalledWith(`apikeyauth:fail:${IP}`);
    expect(valkey.expire).toHaveBeenCalledWith(`apikeyauth:fail:${IP}`, WINDOW);
  });

  it('does not re-arm the TTL on a later failure within the same window', async () => {
    const { service, repo, valkey, req } = await buildService({
      failedAttemptsLimit: LIMIT,
      failedAttemptsWindowSeconds: WINDOW,
    });
    repo.findActiveByHash.mockResolvedValue(null);
    valkey.get.mockResolvedValue(String(LIMIT - 5));
    valkey.incr.mockResolvedValue(LIMIT - 4);

    await service.authenticate(req, RAW).catch(() => undefined);

    expect(valkey.expire).not.toHaveBeenCalled();
  });

  it('does not increment the counter on a successful authentication', async () => {
    const { service, valkey, req } = await buildService();

    await expect(service.authenticate(req, RAW)).resolves.toBe(true);

    expect(valkey.incr).not.toHaveBeenCalled();
  });

  it('does not reset the counter on a successful authentication', async () => {
    const { service, repo, valkey, req } = await buildService();
    valkey.get.mockResolvedValue('5');
    repo.findActiveByHash.mockResolvedValue(principal());

    await service.authenticate(req, RAW);

    // "keep it simple": success neither increments nor clears the bucket.
    expect(valkey.incr).not.toHaveBeenCalled();
    expect(valkey.del).not.toHaveBeenCalled();
  });

  it('fails open (does not block) when Valkey is unreachable for the pre-check', async () => {
    const { service, repo, valkey, req } = await buildService();
    valkey.get.mockRejectedValue(new Error('ECONNREFUSED'));
    repo.findActiveByHash.mockResolvedValue(principal());

    await expect(service.authenticate(req, RAW)).resolves.toBe(true);
  });

  it('still rejects a genuinely invalid key when Valkey is unreachable (fail-open does not mean fail-authenticated)', async () => {
    const { service, repo, valkey, req } = await buildService();
    valkey.get.mockRejectedValue(new Error('ECONNREFUSED'));
    repo.findActiveByHash.mockResolvedValue(null);

    await expect(service.authenticate(req, RAW)).rejects.toMatchObject({
      message: ErrorCode.API_KEY_INVALID,
    });
  });

  it('swallows a counter-increment failure without masking the underlying auth rejection', async () => {
    const { service, repo, valkey, req } = await buildService();
    repo.findActiveByHash.mockResolvedValue(null);
    valkey.incr.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.authenticate(req, RAW)).rejects.toMatchObject({
      message: ErrorCode.API_KEY_INVALID,
    });
  });

  it('keys the counter by request IP, not globally', async () => {
    const { service, repo, valkey, req } = await buildService();
    req.ip = '198.51.100.9';
    repo.findActiveByHash.mockResolvedValue(null);

    await service.authenticate(req, RAW).catch(() => undefined);

    expect(valkey.get).toHaveBeenCalledWith('apikeyauth:fail:198.51.100.9');
    expect(valkey.incr).toHaveBeenCalledWith('apikeyauth:fail:198.51.100.9');
  });
});
