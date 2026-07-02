import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CustomFieldType } from '@prisma/client';
import type { TiptapDoc } from '@repo/shared/schemas';
import { ElasticsearchService } from '@/modules/search/elasticsearch/elasticsearch.service';
import { elasticsearchConfig } from '@/config';
import {
  IndexerCustomField,
  IndexerIssue,
  SearchRepository,
} from '@/modules/search/search.repository';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { IndexerHooksService } from './indexer-hooks.service';
import { AppLogger } from '@/common/logging/app-logger';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';

interface BulkResponse {
  items?: { index?: { error?: unknown } }[];
}

@Injectable()
export class IssueIndexerService {
  private readonly logger = new AppLogger(IssueIndexerService.name);

  constructor(
    private searchRepo: SearchRepository,
    private projectsRepo: ProjectsRepository,
    private es: ElasticsearchService,
    private indexerHooks: IndexerHooksService,
    @Inject(elasticsearchConfig.KEY)
    private config: ConfigType<typeof elasticsearchConfig>,
  ) {}

  // Resolve the project key and enqueue a background reindex — returns
  // immediately (the work runs in the search-indexing worker). Used after a
  // bulk import so the request isn't blocked reindexing thousands of issues.
  async scheduleProjectReindex(
    projectKey: string,
  ): Promise<{ queued: true; projectId: string }> {
    const project = await this.projectsRepo.findEntityByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }
    await this.indexerHooks.enqueueProjectReindex(
      project.id,
      `reindex-api:${projectKey}`,
    );
    return { queued: true, projectId: project.id };
  }

  // Enqueue a background reindex for every active project (one job each, so a
  // single project's failure retries independently). Returns immediately.
  async scheduleAllReindex(): Promise<{ queued: true; projects: number }> {
    const projectIds = await this.projectsRepo.findAllActiveIds();
    for (const projectId of projectIds) {
      await this.indexerHooks.enqueueProjectReindex(projectId, 'reindex-api:all');
    }
    return { queued: true, projects: projectIds.length };
  }

  async indexIssue(issueId: string): Promise<'indexed' | 'removed'> {
    const issue = await this.searchRepo.findForIndex(issueId);

    if (!issue) {
      await this.deleteFromIndex(issueId);
      return 'removed';
    }

    const doc = this.buildDocument(issue);
    await this.es.index({
      index: this.es.issuesIndex,
      id: issueId,
      // Block until the doc is visible to search, so the list refetch that
      // follows a create/update reflects it instead of racing ES's ~1s refresh.
      refresh: 'wait_for',
      document: doc,
    });
    return 'indexed';
  }

  async deleteFromIndex(issueId: string): Promise<void> {
    await this.es.delete({
      index: this.es.issuesIndex,
      id: issueId,
      refresh: 'wait_for',
    });
  }

  async reindexProject(
    projectId: string,
  ): Promise<{ indexed: number; errors: number }> {
    let indexed = 0;
    let errors = 0;
    let cursor: string | undefined;
    const batchSize = this.config.indexerBatchSize;

    while (true) {
      const { items: issues, meta } = await this.searchRepo.findManyForIndex(
        projectId,
        cursor,
        batchSize,
      );

      if (issues.length === 0) break;

      const operations = issues.flatMap((issue) => [
        { index: { _index: this.es.issuesIndex, _id: issue.id } },
        this.buildDocument(issue),
      ]);

      try {
        const result = (await this.es.bulk({ operations })) as BulkResponse;
        const items = result.items ?? [];
        indexed += items.filter((i) => !i.index?.error).length;
        errors += items.filter((i) => i.index?.error).length;
      } catch (err) {
        this.logger.error('Bulk index failed', err, {
          projectId,
          batchSize: issues.length,
        });
        errors += issues.length;
      }

      if (!meta.nextCursor) break;
      cursor = meta.nextCursor;
    }

    this.logger.log('Project reindex finished', { projectId, indexed, errors });
    return { indexed, errors };
  }

  async reindexProjectByKey(
    projectKey: string,
  ): Promise<{ indexed: number; errors: number; projectId: string }> {
    const project = await this.projectsRepo.findEntityByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }
    const result = await this.reindexProject(project.id);
    return { ...result, projectId: project.id };
  }

  async reindexAll(): Promise<{ indexed: number; errors: number }> {
    const projectIds = await this.projectsRepo.findAllActiveIds();

    this.logger.log('Reindex-all started', { projects: projectIds.length });

    let totalIndexed = 0;
    let totalErrors = 0;

    for (const projectId of projectIds) {
      const result = await this.reindexProject(projectId);
      totalIndexed += result.indexed;
      totalErrors += result.errors;
    }

    this.logger.log('Reindex-all finished', {
      projects: projectIds.length,
      indexed: totalIndexed,
      errors: totalErrors,
    });
    return { indexed: totalIndexed, errors: totalErrors };
  }

  private buildDocument(issue: IndexerIssue): Record<string, unknown> {
    const status = issue.project.workflowStatuses.find(
      (s) => s.id === issue.statusId,
    );

    const commentBodies = issue.commentBodies
      .map((b) => this.extractPlainText(b))
      .join(' ');

    return {
      id: issue.id,
      projectId: issue.projectId,
      projectKey: issue.project.key,
      number: issue.number,
      title: issue.title,
      description: issue.description
        ? this.extractPlainText(issue.description)
        : '',
      commentBodies,
      statusId: issue.statusId,
      statusName: status?.name ?? '',
      statusCategory: status?.category ?? 'UNSTARTED',
      isResolved: status?.isResolved ?? false,
      priority: issue.priority,
      type: issue.type,
      assigneeId: issue.assigneeId,
      assigneeName: issue.assigneeName,
      assigneeEmail: issue.assigneeEmail,
      reporterId: issue.reporterId,
      tagIds: issue.tagIds,
      tagNames: issue.tagNames,
      estimate: issue.estimate,
      spent: issue.spent,
      dueDate: issue.dueDate?.toISOString() ?? null,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      resolvedAt: issue.resolvedAt?.toISOString() ?? null,
      isDeleted: issue.deletedAt !== null,
      memberIds: issue.project.memberIds,
      customFields: issue.customFields.map((cfv) =>
        this.buildCustomFieldEntry(cfv),
      ),
    };
  }

  private buildCustomFieldEntry(
    cfv: IndexerCustomField,
  ): Record<string, unknown> {
    const { value } = cfv;
    const entry: Record<string, unknown> = {
      fieldId: cfv.fieldId,
      fieldName: cfv.name,
      fieldType: cfv.type,
      valueKeyword: null,
      valueText: null,
      valueNumber: null,
      valueDate: null,
    };

    switch (cfv.type) {
      case CustomFieldType.TEXT:
        entry.valueText = typeof value === 'string' ? value : null;
        break;
      case CustomFieldType.NUMBER:
      case CustomFieldType.PERIOD:
        entry.valueNumber = typeof value === 'number' ? value : null;
        break;
      case CustomFieldType.DATE:
      case CustomFieldType.DATETIME:
        entry.valueDate = typeof value === 'string' ? value : null;
        break;
      case CustomFieldType.ENUM:
      case CustomFieldType.USER:
      case CustomFieldType.VERSION:
        entry.valueKeyword = typeof value === 'string' ? value : null;
        break;
      case CustomFieldType.MULTI_ENUM:
      case CustomFieldType.MULTI_USER:
      case CustomFieldType.MULTI_VERSION:
        entry.valueKeyword = Array.isArray(value) ? value : null;
        break;
      case CustomFieldType.URL:
        entry.valueText = typeof value === 'string' ? value : null;
        break;
    }

    return entry;
  }

  /**
   * Extract plain text from a Tiptap doc for full-text indexing. Walks the
   * recursive `content` tree and concatenates all `text` nodes. Tolerates
   * unknown shapes (legacy strings, null, malformed JSON) by returning ''.
   */
  private extractPlainText(tiptapJson: unknown): string {
    if (!tiptapJson) return '';
    if (typeof tiptapJson === 'string') return tiptapJson;
    if (typeof tiptapJson !== 'object') return '';

    const parts: string[] = [];
    const walk = (node: TiptapDoc): void => {
      if (typeof node.text === 'string') parts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(walk);
    };
    walk(tiptapJson as TiptapDoc);
    return parts.join(' ');
  }
}
