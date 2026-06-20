import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsCacheService, CachedMembership } from './permissions-cache.service';
import { ValkeyService } from '@/valkey/valkey.service';

describe('PermissionsCacheService', () => {
  let service: PermissionsCacheService;
  let redis: { get: jest.Mock; set: jest.Mock; incr: jest.Mock };
  let loader: jest.Mock;

  const membership: CachedMembership = {
    userId: 'user-1',
    projectId: 'proj-1',
    roleId: 'role-1',
    permissions: ['ISSUE_READ'],
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
    };
    loader = jest.fn().mockResolvedValue(membership);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsCacheService,
        { provide: ValkeyService, useValue: redis },
      ],
    }).compile();

    service = module.get(PermissionsCacheService);
  });

  it('loads from DB and caches on miss', async () => {
    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toEqual(membership);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'perms:0:user-1:proj-1',
      JSON.stringify(membership),
      300,
    );
  });

  it('returns cached membership without hitting the loader', async () => {
    redis.get
      .mockResolvedValueOnce('7')
      .mockResolvedValueOnce(JSON.stringify(membership));

    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toEqual(membership);
    expect(loader).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('perms:7:user-1:proj-1');
  });

  it('caches non-membership negatively with a shorter TTL', async () => {
    loader.mockResolvedValue(null);

    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toBeNull();
    expect(redis.set).toHaveBeenCalledWith('perms:0:user-1:proj-1', 'none', 60);
  });

  it('returns null for a cached negative entry without hitting the loader', async () => {
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('none');

    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('keys entries by the current epoch so invalidation makes them unreachable', async () => {
    redis.get.mockResolvedValueOnce('3').mockResolvedValueOnce(null);

    await service.getMembership('user-1', 'proj-1', loader);

    expect(redis.set).toHaveBeenCalledWith(
      'perms:3:user-1:proj-1',
      expect.any(String),
      300,
    );
  });

  it('invalidateAll bumps the epoch counter', async () => {
    await service.invalidateAll();
    expect(redis.incr).toHaveBeenCalledWith('perms:epoch');
  });

  it('falls back to the loader when the cache read fails', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));

    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toEqual(membership);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('still returns the loaded value when the cache write fails', async () => {
    redis.set.mockRejectedValue(new Error('redis down'));

    const result = await service.getMembership('user-1', 'proj-1', loader);

    expect(result).toEqual(membership);
  });

  it('swallows invalidation failures (logged, not thrown)', async () => {
    redis.incr.mockRejectedValue(new Error('redis down'));

    await expect(service.invalidateAll()).resolves.toBeUndefined();
  });
});
