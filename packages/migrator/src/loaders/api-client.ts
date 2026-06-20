import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { retry } from '../utils/retry';
import { CreateUserMigrationDto } from '../transformers/user.transformer';
import { CreateIssueMigrationDto } from '../transformers/issue.transformer';
import { YtAttachment } from '../youtrack/types/yt-issue.type';

export class OurApiClient {
  private readonly http: AxiosInstance;

  constructor(config: {
    url: string;
    token: string;
    migrationSecret: string;
  }) {
    this.http = axios.create({
      baseURL: `${config.url.replace(/\/$/, '')}/api`,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'x-migration-secret': config.migrationSecret,
      },
      timeout: 30_000,
    });
  }

  async createMigratedUser(dto: CreateUserMigrationDto): Promise<{ data: any; existed: boolean }> {
    return retry(async () => {
      const { data } = await this.http.post('/admin/migration/users', dto);
      return data;
    });
  }

  async findUserByEmail(email: string): Promise<any | null> {
    return retry(async () => {
      const { data } = await this.http.get('/admin/migration/users/by-email', {
        params: { email },
      });
      return data.data;
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
      return data;
    });
  }

  async findIssueByYtId(ytId: string): Promise<any | null> {
    return retry(async () => {
      const { data } = await this.http.get(
        `/admin/migration/issues/by-yt-id/${ytId}`,
      );
      return data.data;
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
      return data.data;
    });
  }

  async uploadAttachmentStream(
    issueId: string,
    attachment: YtAttachment,
    stream: Readable,
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', stream, {
      filename: attachment.name,
      contentType: attachment.mimeType,
      knownLength: attachment.size,
    });

    const { data } = await this.http.post(
      `/issues/${issueId}/attachments`,
      formData,
      {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 120_000,
      },
    );
    return data.data?.[0];
  }

  async getProjectStats(projectKey: string): Promise<{
    projectKey: string;
    projectId: string;
    counts: { issues: number; comments: number; attachments: number; timeLogs: number };
  }> {
    const { data } = await this.http.get(
      `/admin/migration/stats/${projectKey}`,
    );
    return data;
  }
}
