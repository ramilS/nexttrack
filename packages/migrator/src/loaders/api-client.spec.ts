import axios from 'axios';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  OurApiClient,
  type DiscoverMigrationEntities,
  type StartMigrationRun,
  type TransitionMigrationEntity,
  unwrapEnvelope,
} from './api-client';

describe('unwrapEnvelope', () => {
  it('strips the TransformInterceptor { data, meta } envelope to the service payload', () => {
    const body = {
      data: { data: { id: 'issue-1' }, existed: false },
      meta: { timestamp: '2026-07-01T00:00:00.000Z' },
    };

    expect(unwrapEnvelope<{ data: { id: string }; existed: boolean }>(body)).toEqual({
      data: { id: 'issue-1' },
      existed: false,
    });
  });

  it('unwraps a find-style payload so the inner entity is reachable', () => {
    const body = { data: { data: { id: 'user-1' } }, meta: {} };

    const payload = unwrapEnvelope<{ data: { id: string } | null }>(body);
    expect(payload.data).toEqual({ id: 'user-1' });
  });

  it('unwraps a stats payload directly', () => {
    const body = { data: { projectKey: 'DEVX', counts: { issues: 3 } }, meta: {} };

    expect(unwrapEnvelope<{ projectKey: string; counts: { issues: number } }>(body)).toEqual({
      projectKey: 'DEVX',
      counts: { issues: 3 },
    });
  });
});

describe('OurApiClient migration manifest methods', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    const http = axios.create();
    const client = new OurApiClient(
      {
        url: 'https://nexttrack.example',
        token: 'target-token',
        migrationSecret: 'migration-secret',
      },
      http,
    );
    return { client, http };
  }

  const run = {
    id: 'run-1',
    sourceSystem: 'youtrack-cloud' as const,
    sourceTenant: 'source.example',
    sourceUrl: 'https://source.example',
    targetUrl: 'https://nexttrack.example',
    configHash: 'a'.repeat(64),
    specVersion: '2026-07-14' as const,
    exclusionVersion: '2026-07-14' as const,
    status: 'RUNNING' as const,
    startedAt: '2026-07-14T00:00:00.000Z',
    completedAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
  const entity = {
    id: 'entity-1',
    runId: run.id,
    entityType: 'issue',
    sourceId: '2-42',
    sourceChecksum: 'b'.repeat(64),
    targetId: null,
    status: 'DISCOVERED' as const,
    attemptCount: 0,
    errorCode: null,
    errorMessage: null,
    discoveredAt: '2026-07-14T00:00:00.000Z',
    transformedAt: null,
    loadedAt: null,
    verifiedAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };

  it('starts a run with the exact body and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const dto: StartMigrationRun = {
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'source.example',
      sourceUrl: 'https://source.example',
      targetUrl: 'https://nexttrack.example',
      config: { projects: ['APP'] },
      configHash: 'a'.repeat(64),
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    };
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      data: { data: { data: run }, meta: {} },
    });

    await expect(client.startMigrationRun(dto)).resolves.toEqual({ data: run });
    expect(post).toHaveBeenCalledWith('/admin/migration/runs', dto);
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toMatch(
      /target-token|migration-secret/i,
    );
  });

  it('gets a run summary and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const get = vi.spyOn(http, 'get').mockResolvedValue({
      data: { data: { data: run, counts: { DISCOVERED: 1 } }, meta: {} },
    });

    await expect(client.getMigrationRun(run.id)).resolves.toEqual({
      data: run,
      counts: { DISCOVERED: 1 },
    });
    expect(get).toHaveBeenCalledWith(`/admin/migration/runs/${run.id}`);
  });

  it('discovers entities with the exact body and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const dto: DiscoverMigrationEntities = {
      entities: [
        {
          entityType: entity.entityType,
          sourceId: entity.sourceId,
          sourceChecksum: entity.sourceChecksum,
        },
      ],
    };
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      data: { data: { data: [entity] }, meta: {} },
    });

    await expect(client.discoverEntities(run.id, dto)).resolves.toEqual({
      data: [entity],
    });
    expect(post).toHaveBeenCalledWith(
      `/admin/migration/runs/${run.id}/entities/discover`,
      dto,
    );
  });

  it('transitions an entity with the exact body and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const dto: TransitionMigrationEntity = {
      entityType: entity.entityType,
      sourceId: entity.sourceId,
      sourceChecksum: entity.sourceChecksum,
      status: 'TRANSFORMED',
      targetId: 'target-1',
    };
    const transitioned = { ...entity, status: 'TRANSFORMED' as const, targetId: 'target-1' };
    const patch = vi.spyOn(http, 'patch').mockResolvedValue({
      data: { data: { data: transitioned }, meta: {} },
    });

    await expect(client.transitionEntity(run.id, dto)).resolves.toEqual({
      data: transitioned,
    });
    expect(patch).toHaveBeenCalledWith(
      `/admin/migration/runs/${run.id}/entities/state`,
      dto,
    );
  });

  it('lists entities with the exact query params and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const params = {
      entityType: 'issue',
      status: 'DISCOVERED' as const,
      cursor: 'entity-0',
      limit: 25,
    };
    const get = vi.spyOn(http, 'get').mockResolvedValue({
      data: { data: { data: [entity] }, meta: {} },
    });

    await expect(client.listEntities(run.id, params)).resolves.toEqual({
      data: [entity],
    });
    expect(get).toHaveBeenCalledWith(
      `/admin/migration/runs/${run.id}/entities`,
      { params },
    );
  });

  it('completes a run without a request body and unwraps the global envelope', async () => {
    const { client, http } = setup();
    const completedRun = {
      ...run,
      status: 'COMPLETED' as const,
      completedAt: '2026-07-14T01:00:00.000Z',
    };
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      data: {
        data: { data: completedRun, counts: { VERIFIED: 1 } },
        meta: {},
      },
    });

    await expect(client.completeMigrationRun(run.id)).resolves.toEqual({
      data: completedRun,
      counts: { VERIFIED: 1 },
    });
    expect(post).toHaveBeenCalledWith(
      `/admin/migration/runs/${run.id}/complete`,
    );
  });

  it('retries a transient manifest failure for four total calls', async () => {
    vi.useFakeTimers();
    const { client, http } = setup();
    const post = vi.spyOn(http, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { status: 503 },
    });
    const promise = client.completeMigrationRun(run.id);

    const assertion = expect(promise).rejects.toThrow('[object Object]');
    await vi.runAllTimersAsync();
    await assertion;

    expect(post).toHaveBeenCalledTimes(4);
  });

  it('does not retry a permanent manifest failure', async () => {
    const { client, http } = setup();
    const post = vi.spyOn(http, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { status: 400 },
    });

    await expect(client.completeMigrationRun(run.id)).rejects.toThrow(
      '[object Object]',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
