import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { GlobalRole, UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysRepository, ApiKeyPrincipalRow } from './api-keys.repository';
import { hashApiKey } from './api-key-token';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import type { IntegrationRequest } from '@/common/http/integration-request';

const RAW = 'nt_test_key_value';

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

describe('ApiKeyAuthService', () => {
  let service: ApiKeyAuthService;
  let repo: jest.Mocked<ApiKeysRepository>;
  let background: { run: jest.Mock };
  let req: IntegrationRequest;

  beforeEach(async () => {
    repo = {
      findActiveByHash: jest.fn().mockResolvedValue(principal()),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ApiKeysRepository>;
    background = { run: jest.fn() };
    req = { headers: {} } as IntegrationRequest;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeyAuthService,
        { provide: ApiKeysRepository, useValue: repo },
        { provide: BackgroundTasks, useValue: background },
      ],
    }).compile();

    service = moduleRef.get(ApiKeyAuthService);
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
