import axios, { AxiosInstance } from 'axios';
import { Readable } from 'stream';
import { retry } from '../utils/retry';
import { classifyMigrationError } from '../utils/error-classification';
import { CreateUserMigrationDto } from '../transformers/user.transformer';
import { CreateIssueMigrationDto } from '../transformers/issue.transformer';
import { CreateCustomFieldDto } from '../transformers/custom-field-def.transformer';
import { YtAttachment } from '../youtrack/types/yt-issue.type';

/**
 * The API wraps every response in the global TransformInterceptor envelope
 * `{ data: <payload>, meta }`. Strip that envelope to get the service payload.
 * Without this, the loader reads ids one level too shallow (→ undefined) and
 * every id-map registration silently breaks.
 */
export function unwrapEnvelope<T>(body: unknown): T {
  return (body as { data: T }).data;
}

export type MigrationRunStatus = 'RUNNING' | 'FAILED' | 'COMPLETED';
export type MigrationEntityStatus =
  | 'DISCOVERED'
  | 'TRANSFORMED'
  | 'LOADED'
  | 'VERIFIED'
  | 'FAILED'
  | 'EXCLUDED_APPROVED';

export interface StartMigrationRun {
  sourceSystem: 'youtrack-cloud';
  sourceTenant: string;
  sourceUrl: string;
  targetUrl: string;
  config: Record<string, unknown>;
  configHash: string;
  specVersion: '2026-07-14';
  exclusionVersion: '2026-07-14';
}

export interface DiscoverMigrationEntities {
  entities: Array<{
    entityType: string;
    sourceId: string;
    sourceChecksum: string;
  }>;
}

export interface TransitionMigrationEntity {
  entityType: string;
  sourceId: string;
  sourceChecksum: string;
  status: MigrationEntityStatus;
  targetId?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ListMigrationEntitiesQuery {
  entityType?: string;
  status?: MigrationEntityStatus;
  cursor?: string;
  limit?: number;
}

export interface MigrationRun {
  id: string;
  sourceSystem: 'youtrack-cloud';
  sourceTenant: string;
  sourceUrl: string;
  targetUrl: string;
  configHash: string;
  specVersion: '2026-07-14';
  exclusionVersion: '2026-07-14';
  status: MigrationRunStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationEntity {
  id: string;
  runId: string;
  entityType: string;
  sourceId: string;
  sourceChecksum: string;
  targetId: string | null;
  status: MigrationEntityStatus;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  discoveredAt: string;
  transformedAt: string | null;
  loadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationRunResult {
  data: MigrationRun;
}

export interface MigrationRunSummary extends MigrationRunResult {
  counts: Partial<Record<MigrationEntityStatus, number>>;
}

export interface MigrationEntitiesResult {
  data: MigrationEntity[];
}

export interface MigrationEntityResult {
  data: MigrationEntity;
}

const MANIFEST_RETRY_OPTIONS = {
  attempts: 4,
  delay: 500,
  backoff: 2,
  jitter: 0.2,
  shouldRetry: (error: unknown) =>
    classifyMigrationError(error) === 'TRANSIENT',
};

export class OurApiClient {
  private readonly http: AxiosInstance;

  constructor(
    config: { url: string; token: string; migrationSecret: string },
    http?: AxiosInstance,
  ) {
    this.http =
      http ??
      axios.create({
        baseURL: `${config.url.replace(/\/$/, '')}/api`,
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'x-migration-secret': config.migrationSecret,
        },
        timeout: 30_000,
      });
  }

  async startMigrationRun(dto: StartMigrationRun): Promise<MigrationRunResult> {
    return retry(async () => {
      const { data } = await this.http.post('/admin/migration/runs', dto);
      return unwrapEnvelope<MigrationRunResult>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async getMigrationRun(runId: string): Promise<MigrationRunSummary> {
    return retry(async () => {
      const { data } = await this.http.get(`/admin/migration/runs/${runId}`);
      return unwrapEnvelope<MigrationRunSummary>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async discoverEntities(
    runId: string,
    dto: DiscoverMigrationEntities,
  ): Promise<MigrationEntitiesResult> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/runs/${runId}/entities/discover`,
        dto,
      );
      return unwrapEnvelope<MigrationEntitiesResult>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async transitionEntity(
    runId: string,
    dto: TransitionMigrationEntity,
  ): Promise<MigrationEntityResult> {
    return retry(async () => {
      const { data } = await this.http.patch(
        `/admin/migration/runs/${runId}/entities/state`,
        dto,
      );
      return unwrapEnvelope<MigrationEntityResult>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async listEntities(
    runId: string,
    params: ListMigrationEntitiesQuery = {},
  ): Promise<MigrationEntitiesResult> {
    return retry(async () => {
      const { data } = await this.http.get(
        `/admin/migration/runs/${runId}/entities`,
        { params },
      );
      return unwrapEnvelope<MigrationEntitiesResult>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async completeMigrationRun(runId: string): Promise<MigrationRunSummary> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/runs/${runId}/complete`,
      );
      return unwrapEnvelope<MigrationRunSummary>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async createMigratedUser(dto: CreateUserMigrationDto): Promise<{ data: any; existed: boolean }> {
    return retry(async () => {
      const { data } = await this.http.post('/admin/migration/users', dto);
      return unwrapEnvelope<{ data: any; existed: boolean }>(data);
    }, MANIFEST_RETRY_OPTIONS);
  }

  async findUserByEmail(email: string): Promise<any | null> {
    return retry(async () => {
      const { data } = await this.http.get('/admin/migration/users/by-email', {
        params: { email },
      });
      return unwrapEnvelope<{ data: any }>(data).data;
    });
  }

  async createMigratedIssue(
    projectKey: string,
    dto: CreateIssueMigrationDto,
  ): Promise<{ data: any; existed: boolean }> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/issues/${projectKey}`,
        dto,
      );
      return unwrapEnvelope<{ data: any; existed: boolean }>(data);
    });
  }

  async findIssueByYtId(ytId: string): Promise<any | null> {
    return retry(async () => {
      const { data } = await this.http.get(
        `/admin/migration/issues/by-yt-id/${ytId}`,
      );
      return unwrapEnvelope<{ data: any }>(data).data;
    });
  }

  async setIssueParent(issueId: string, parentId: string): Promise<void> {
    await retry(async () => {
      await this.http.patch(`/admin/migration/issues/${issueId}/parent`, {
        parentId,
      });
    });
  }

  async setOriginalDates(
    issueId: string,
    dates: { createdAt: string; updatedAt: string; resolvedAt?: string | null },
  ): Promise<void> {
    await retry(async () => {
      await this.http.patch(`/admin/migration/issues/${issueId}/dates`, dates);
    });
  }

  async createComment(
    issueId: string,
    authorId: string,
    body: any,
    originalCreatedAt?: string,
  ): Promise<any> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/issues/${issueId}/comments`,
        { authorId, body, originalCreatedAt },
      );
      return unwrapEnvelope<{ data: any }>(data).data;
    });
  }

  // Streams the file body straight to the migration upload endpoint (no size
  // cap / MIME check, unlike the interactive endpoint), carrying the original
  // author + date so no follow-up metadata call is needed. Metadata rides in
  // the query string; the body is the raw bytes.
  //
  // Sent WITHOUT Content-Length (chunked transfer): YouTrack's reported `size`
  // often differs from the bytes actually streamed, and a wrong Content-Length
  // makes the server's S3 upload fail with IncompleteBody/ExcessData. The
  // server derives the true size from the received body instead.
  async uploadAttachmentStream(
    issueId: string,
    attachment: YtAttachment,
    stream: Readable,
    meta: { uploadedById: string; originalCreatedAt?: string },
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      filename: attachment.name,
      mimeType: attachment.mimeType,
      uploadedById: meta.uploadedById,
    });
    if (meta.originalCreatedAt) params.set('originalCreatedAt', meta.originalCreatedAt);

    const { data } = await this.http.post(
      `/admin/migration/issues/${issueId}/attachments?${params.toString()}`,
      stream,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        // Large files over a slow source link — allow up to 10 min.
        timeout: 600_000,
      },
    );
    return unwrapEnvelope<{ data: { id: string } }>(data).data;
  }

  async getProjectStats(projectKey: string): Promise<{
    projectKey: string;
    projectId: string;
    counts: { issues: number; comments: number; attachments: number; timeLogs: number };
  }> {
    const { data } = await this.http.get(
      `/admin/migration/stats/${projectKey}`,
    );
    return unwrapEnvelope(data);
  }

  async addProjectMembers(
    projectKey: string,
    members: Array<{ userId: string; roleName?: string }>,
  ): Promise<void> {
    if (members.length === 0) return;
    await retry(async () => {
      await this.http.post(`/admin/migration/projects/${projectKey}/members`, {
        members,
      });
    });
  }

  async createTag(
    projectKey: string,
    tag: { name: string; color: string },
  ): Promise<{ data: { id: string; name: string }; existed: boolean }> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/projects/${projectKey}/tags`,
        tag,
      );
      return unwrapEnvelope<{ data: { id: string; name: string }; existed: boolean }>(
        data,
      );
    });
  }

  async createCustomField(
    projectKey: string,
    dto: CreateCustomFieldDto,
  ): Promise<{
    data: { id: string; name: string; options: Array<{ id: string; name: string }> };
    existed: boolean;
  }> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/projects/${projectKey}/custom-fields`,
        dto,
      );
      return unwrapEnvelope<{
        data: { id: string; name: string; options: Array<{ id: string; name: string }> };
        existed: boolean;
      }>(data);
    });
  }

  // Enqueue a background reindex for the project (async) — the endpoint
  // returns immediately; the search-indexing worker rebuilds the ES index.
  // Migration writes issues directly (bypassing per-issue indexer hooks), so
  // this single call makes the imported issues searchable.
  async reindexProject(projectKey: string): Promise<void> {
    await retry(async () => {
      await this.http.post('/search/reindex', { projectKey, async: true });
    });
  }

  async listAttachments(
    issueId: string,
  ): Promise<Array<{ filename: string; size: number }>> {
    return retry(async () => {
      const { data } = await this.http.get(`/issues/${issueId}/attachments`);
      // This is the regular list endpoint: the envelope's data IS the array
      // (unlike the migration endpoints, which return { data, existed }).
      const list = unwrapEnvelope<Array<{ filename: string; size: number }>>(data);
      return list.map((a) => ({ filename: a.filename, size: a.size }));
    });
  }

  async createProject(dto: {
    key: string;
    name: string;
    description?: string | null;
    statuses: Array<{
      name: string;
      category: string;
      isInitial: boolean;
      isResolved: boolean;
      ordinal: number;
      color?: string;
    }>;
  }): Promise<string> {
    return retry(async () => {
      const { data } = await this.http.post('/admin/migration/projects', dto);
      return unwrapEnvelope<{ data: { id: string }; existed: boolean }>(data)
        .data.id;
    });
  }

  async createBoard(
    projectKey: string,
    dto: { name: string; type: 'KANBAN' | 'SCRUM' },
  ): Promise<string> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/projects/${projectKey}/boards`,
        dto,
      );
      return unwrapEnvelope<{ data: { id: string } }>(data).data.id;
    });
  }

  async createSprint(
    boardId: string,
    dto: { name: string; goal?: string; startDate?: string; endDate?: string },
  ): Promise<string> {
    return retry(async () => {
      const { data } = await this.http.post(
        `/admin/migration/boards/${boardId}/sprints`,
        dto,
      );
      return unwrapEnvelope<{ data: { id: string } }>(data).data.id;
    });
  }

  async addSprintIssues(
    boardId: string,
    sprintId: string,
    issueIds: string[],
  ): Promise<void> {
    if (issueIds.length === 0) return;
    await retry(async () => {
      await this.http.post(
        `/admin/migration/boards/${boardId}/sprints/${sprintId}/issues`,
        { issueIds },
      );
    });
  }

  async createTimeLogs(
    issueId: string,
    entries: Array<{
      userId: string;
      minutes: number;
      date: string;
      description: string | null;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await retry(async () => {
      await this.http.post(`/admin/migration/issues/${issueId}/time-logs`, {
        entries,
      });
    });
  }

  async createActivities(
    issueId: string,
    entries: Array<{
      type: string;
      actorId: string;
      createdAt: string;
      payload: Record<string, unknown>;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await retry(async () => {
      await this.http.post(`/admin/migration/issues/${issueId}/activities`, {
        entries,
      });
    });
  }

  async createIssueLink(
    sourceIssueId: string,
    dto: { type: string; targetIssueId: string },
  ): Promise<void> {
    await retry(async () => {
      await this.http.post(
        `/admin/migration/issues/${sourceIssueId}/links`,
        dto,
      );
    });
  }

  async linkIssueTags(issueId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    await retry(async () => {
      await this.http.post(`/admin/migration/issues/${issueId}/tags`, {
        tagIds,
      });
    });
  }

  async getStatusMap(
    projectKey: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return retry(async () => {
      const { data } = await this.http.get(
        `/admin/migration/statuses/${projectKey}`,
      );
      return unwrapEnvelope<{ data: Array<{ id: string; name: string }> }>(data)
        .data;
    });
  }

  async getCustomFieldMap(projectKey: string): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      options: Array<{ id: string; name: string }>;
    }>
  > {
    return retry(async () => {
      const { data } = await this.http.get(
        `/admin/migration/custom-fields/${projectKey}`,
      );
      return unwrapEnvelope<{
        data: Array<{
          id: string;
          name: string;
          type: string;
          options: Array<{ id: string; name: string }>;
        }>;
      }>(data).data;
    });
  }
}
