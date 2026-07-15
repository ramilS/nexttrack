import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { OurApiClient, MigrationEntity } from '../loaders/api-client';
import { canonicalEntity } from './manifest.types';
import { ManifestEntityExecutor, MigrationVerificationMismatchError } from './entity-executor';
import { retry } from '../utils/retry';

const runId = 'run-1';
const entity = canonicalEntity(
  {
    sourceSystem: 'youtrack-cloud',
    entityType: 'user',
    sourceId: 'yt-user-1',
  },
  { email: 'user@example.com' },
);

function manifestEntity(
  status: MigrationEntity['status'],
  overrides: Partial<MigrationEntity> = {},
): MigrationEntity {
  return {
    id: 'entity-1',
    runId,
    entityType: entity.entityType,
    sourceId: entity.sourceId,
    sourceChecksum: entity.checksum,
    targetId: null,
    status,
    attemptCount: 0,
    errorCode: null,
    errorMessage: null,
    discoveredAt: '2026-07-14T00:00:00.000Z',
    transformedAt: null,
    loadedAt: null,
    verifiedAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

function setup(discovered = manifestEntity('DISCOVERED')) {
  const events: string[] = [];
  const api = {
    discoverEntities: vi.fn(async () => {
      events.push('discover');
      return { data: [discovered] };
    }),
    transitionEntity: vi.fn(async (_runId, transition) => {
      events.push(`transition:${transition.status}`);
      return {
        data: manifestEntity(transition.status, {
          targetId: transition.targetId ?? null,
        }),
      };
    }),
  } as unknown as OurApiClient;
  const handlers = {
    transform: vi.fn(async (payload: typeof entity.payload) => {
      events.push('transform');
      return { ...payload, normalized: true };
    }),
    load: vi.fn(async () => {
      events.push('load');
      return { targetId: 'target-user-1' };
    }),
    verify: vi.fn(async () => {
      events.push('verify');
    }),
  };
  return { api, events, handlers };
}

function axiosError(status: number, code = 'HTTP_ERROR'): AxiosError {
  const config: InternalAxiosRequestConfig = {
    method: 'post',
    url: '/users',
    headers: new AxiosHeaders(),
  };
  return new AxiosError(`request failed: ${status}`, code, config, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    data: { error: { code, message: 'request failed' } },
  });
}

describe('ManifestEntityExecutor', () => {
  it('discovers a new entity and advances it through transform, load, and explicit verification', async () => {
    const { api, events, handlers } = setup();

    await expect(new ManifestEntityExecutor(runId, api).execute(entity, handlers)).resolves.toEqual(
      {
        status: 'VERIFIED',
        targetId: 'target-user-1',
        skipped: false,
      },
    );

    expect(events).toEqual([
      'discover',
      'transition:TRANSFORMED',
      'transform',
      'load',
      'transition:LOADED',
      'verify',
      'transition:VERIFIED',
    ]);
  });

  it('skips callbacks only when discovery returns an already verified entity', async () => {
    const { api, handlers } = setup(manifestEntity('VERIFIED', { targetId: 'target-user-1' }));

    await expect(new ManifestEntityExecutor(runId, api).execute(entity, handlers)).resolves.toEqual(
      {
        status: 'VERIFIED',
        targetId: 'target-user-1',
        skipped: true,
      },
    );
    expect(handlers.transform).not.toHaveBeenCalled();
    expect(handlers.load).not.toHaveBeenCalled();
    expect(handlers.verify).not.toHaveBeenCalled();
  });

  it('rejects a verified discovery response from a foreign run before accepting its target or invoking callbacks', async () => {
    const { api, handlers } = setup(
      manifestEntity('VERIFIED', {
        runId: 'foreign-run',
        targetId: 'foreign-target',
      }),
    );

    await expect(
      new ManifestEntityExecutor(runId, api).execute(entity, handlers),
    ).rejects.toMatchObject({
      name: 'ManifestDiscoveryIntegrityError',
      code: 'MIGRATION_MANIFEST_INTEGRITY_ERROR',
      message: `Manifest discovery identity mismatch for user ${entity.sourceId}`,
    });
    expect(handlers.transform).not.toHaveBeenCalled();
    expect(handlers.load).not.toHaveBeenCalled();
    expect(handlers.verify).not.toHaveBeenCalled();
    expect(api.transitionEntity).not.toHaveBeenCalled();
  });

  it('runs callbacks when discovery reopens a changed checksum as discovered', async () => {
    const changed = canonicalEntity(
      {
        sourceSystem: 'youtrack-cloud',
        entityType: 'user',
        sourceId: entity.sourceId,
      },
      { email: 'changed@example.com' },
    );
    const { api, handlers } = setup(
      manifestEntity('DISCOVERED', { sourceChecksum: changed.checksum }),
    );

    await new ManifestEntityExecutor(runId, api).execute(changed, handlers);

    expect(handlers.transform).toHaveBeenCalledWith(changed.payload);
    expect(handlers.load).toHaveBeenCalledOnce();
    expect(handlers.verify).toHaveBeenCalledOnce();
  });

  it('leaves transient retry ownership with the loader callback and verifies its final success', async () => {
    const { api, handlers } = setup();
    let loaderAttempts = 0;
    handlers.load.mockImplementation(() =>
      retry(
        async () => {
          loaderAttempts++;
          if (loaderAttempts < 3) throw axiosError(503);
          return { targetId: 'target-user-1' };
        },
        { attempts: 3, delay: 0, backoff: 1 },
      ),
    );

    await new ManifestEntityExecutor(runId, api).execute(entity, handlers);

    expect(handlers.load).toHaveBeenCalledOnce();
    expect(loaderAttempts).toBe(3);
    expect(handlers.verify).toHaveBeenCalledOnce();
  });

  it('records a structured failed transition and returns FAILED for a permanent entity error', async () => {
    const { api, handlers } = setup();
    handlers.load.mockRejectedValue(axiosError(422, 'VALIDATION_ERROR'));

    await expect(
      new ManifestEntityExecutor(runId, api).execute(entity, handlers),
    ).resolves.toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('422'),
    });
    expect(api.transitionEntity).toHaveBeenLastCalledWith(
      runId,
      expect.objectContaining({
        entityType: 'user',
        sourceId: entity.sourceId,
        sourceChecksum: entity.checksum,
        status: 'FAILED',
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('422'),
        }),
      }),
    );
  });

  it('rethrows a fatal auth error promptly and prevents a caller loop from reaching later entities', async () => {
    const { api, handlers } = setup();
    const fatal = axiosError(401, 'UNAUTHORIZED');
    handlers.load.mockRejectedValue(fatal);
    const later = vi.fn();

    await expect(
      (async () => {
        await new ManifestEntityExecutor(runId, api).execute(entity, handlers);
        await later();
      })(),
    ).rejects.toBe(fatal);
    expect(later).not.toHaveBeenCalled();
  });

  it('records verifier mismatches with MIGRATION_VERIFICATION_MISMATCH', async () => {
    const { api, handlers } = setup();
    handlers.verify.mockRejectedValue(
      new MigrationVerificationMismatchError('Target user name differs'),
    );

    await expect(new ManifestEntityExecutor(runId, api).execute(entity, handlers)).resolves.toEqual(
      {
        status: 'FAILED',
        error: 'Target user name differs',
      },
    );
    expect(api.transitionEntity).toHaveBeenLastCalledWith(
      runId,
      expect.objectContaining({
        status: 'FAILED',
        error: {
          code: 'MIGRATION_VERIFICATION_MISMATCH',
          message: 'Target user name differs',
        },
      }),
    );
  });

  it('preserves manifest optimistic conflicts instead of converting them to entity failures', async () => {
    const { api, handlers } = setup();
    const conflict = axiosError(409, 'MIGRATION_INVALID_STATE_TRANSITION');
    vi.mocked(api.transitionEntity).mockRejectedValueOnce(conflict);

    await expect(new ManifestEntityExecutor(runId, api).execute(entity, handlers)).rejects.toBe(
      conflict,
    );
    expect(api.transitionEntity).toHaveBeenCalledOnce();
  });

  it('preserves a permanent verifier API error instead of calling it a semantic mismatch', async () => {
    const { api, handlers } = setup();
    handlers.verify.mockRejectedValue(axiosError(422, 'LOOKUP_VALIDATION_ERROR'));

    await expect(
      new ManifestEntityExecutor(runId, api).execute(entity, handlers),
    ).resolves.toMatchObject({
      status: 'FAILED',
    });
    expect(api.transitionEntity).toHaveBeenLastCalledWith(
      runId,
      expect.objectContaining({
        status: 'FAILED',
        error: expect.objectContaining({ code: 'LOOKUP_VALIDATION_ERROR' }),
      }),
    );
  });
});
