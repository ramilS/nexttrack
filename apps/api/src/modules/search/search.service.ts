import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AppLogger } from '@/common/logging/app-logger';
import {
  SearchEngineService,
  type SearchEngineResult,
} from './engine/search-engine.service';
import { SearchQueryBuilderService } from './engine/search-query-builder.service';
import { searchEngineConfig } from '@/config';
import { encodeSearchCursor, decodeSearchCursor } from '@/common/utils/cursor';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectAccessService } from '@/modules/projects/project-access.service';
import {
  SearchHydrationRow,
  SearchRepository,
} from './search.repository';
import { Lexer } from './query-language/lexer';
import { Parser } from './query-language/parser';
import type {
  ParsedQuery,
} from './query-language/ast.types';
import type {
  ParseError,
  SearchIssue,
  SearchMeta,
  SearchResponse,
  SearchResultItem,
  ValidateResponse,
  WorkflowStatus,
} from '@repo/shared/schemas';

const UNKNOWN_STATUS = {
  name: 'Unknown',
  color: '#888',
  category: 'UNSTARTED' as const,
};

function toSearchIssue(
  row: SearchHydrationRow,
  statuses: WorkflowStatus[],
): SearchIssue {
  const status = statuses.find((s) => s.id === row.statusId);

  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: status
      ? {
          id: status.id,
          name: status.name,
          color: status.color,
          category: status.category,
        }
      : { id: row.statusId, ...UNKNOWN_STATUS },
    assignee: row.assignee,
    reporter: row.reporter,
    tags: row.tags.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt.toISOString(),
    })),
    dueDate: row.dueDate?.toISOString() ?? null,
    sprintName: row.sprintName,
    project: row.project,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function readTotal(total: SearchEngineResult['hits']): number {
  if (!total) return 0;
  const t = total.total;
  if (typeof t === 'number') return t;
  return t?.value ?? 0;
}

function toParseErrors(errors: ParsedQuery['errors']): ParseError[] {
  return errors.map((e) => ({
    message: e.message,
    pos: e.pos,
    length: e.length,
  }));
}

@Injectable()
export class SearchService {
  private readonly logger = new AppLogger(SearchService.name);

  constructor(
    private engine: SearchEngineService,
    private queryBuilder: SearchQueryBuilderService,
    private searchRepo: SearchRepository,
    private projectAccess: ProjectAccessService,
    private workflowsRepo: WorkflowsReader,
    @Inject(searchEngineConfig.KEY)
    private config: ConfigType<typeof searchEngineConfig>,
  ) {}

  async search(
    query: string,
    userId: string,
    options?: {
      projectId?: string;
      cursor?: string;
      pageSize?: number;
    },
  ): Promise<SearchResponse> {
    const pageSize = Math.min(
      options?.pageSize ?? this.config.searchDefaultPageSize,
      this.config.searchMaxPageSize,
    );

    const accessibleProjectIds = await this.projectAccess.findAccessibleProjectIds(
      userId,
      options?.projectId,
    );

    if (accessibleProjectIds.length === 0) {
      return this.emptyResult(pageSize);
    }

    const isEmptyQuery = !query || !query.trim();
    const parsed: ParsedQuery = isEmptyQuery
      ? { filters: [], sort: null, errors: [] }
      : this.parseQuery(query);

    const esQuery = this.queryBuilder.build(parsed, {
      currentUserId: userId,
      accessibleProjectIds,
      scopedProjectId: options?.projectId,
    });

    const searchParams: { index: string } & Record<string, unknown> = {
      index: this.engine.issuesIndex,
      ...esQuery,
      size: pageSize + 1, // Fetch N+1 for hasNextPage detection
      track_total_hits: true,
    };

    if (options?.cursor) {
      const cursorData = decodeSearchCursor(options.cursor);
      searchParams.search_after = cursorData.searchAfter;
    }

    const start = Date.now();
    const engineResult = await this.engine.search(searchParams);
    const took = Date.now() - start;

    const hits = engineResult.hits?.hits ?? [];
    const total = readTotal(engineResult.hits);

    this.logger.debug('Search executed', {
      filters: parsed.filters.length,
      hasSort: parsed.sort !== null,
      parseErrors: parsed.errors.length,
      projectScope: accessibleProjectIds.length,
      total,
      hits: hits.length,
      tookMs: took,
    });

    if (hits.length === 0) {
      return this.emptyResult(pageSize, took, parsed);
    }

    const hasNextPage = hits.length > pageSize;
    const trimmedHits = hasNextPage ? hits.slice(0, pageSize) : hits;
    const lastHit = trimmedHits[trimmedHits.length - 1];

    const nextCursor =
      hasNextPage && lastHit?.sort
        ? encodeSearchCursor({ searchAfter: lastHit.sort, id: lastHit._id })
        : null;

    const issueIds = trimmedHits.map((h) => h._id);
    const issues = await this.searchRepo.findManyForSearchHydration(issueIds);
    const issueMap = new Map(issues.map((i) => [i.id, i]));

    const projectIds = [...new Set(issues.map((i) => i.projectId))];
    const statusesByProject =
      await this.workflowsRepo.findDefaultStatusesByProjects(projectIds);

    // Preserve ES ordering
    const items: SearchResultItem[] = trimmedHits.flatMap((hit) => {
      const issue = issueMap.get(hit._id);
      if (!issue) return [];

      const statuses = statusesByProject.get(issue.projectId) ?? [];
      return [
        {
          issue: toSearchIssue(issue, statuses),
          highlights: {
            title: hit.highlight?.title,
            description: hit.highlight?.description,
            commentBodies: hit.highlight?.commentBodies,
          },
          score: hit._score,
        },
      ];
    });

    return {
      items,
      meta: {
        total,
        nextCursor,
        pageSize,
        hasNextPage,
        took,
        query: {
          filters: parsed.filters.length,
          hasSort: parsed.sort !== null,
          errors: toParseErrors(parsed.errors),
        },
      },
    };
  }

  parseQuery(query: string): ParsedQuery {
    const lexer = new Lexer(query);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    return parser.parse();
  }

  validateQuery(query: string): ValidateResponse {
    const parsed = this.parseQuery(query);
    return {
      valid: parsed.errors.length === 0,
      errors: toParseErrors(parsed.errors),
    };
  }

  private emptyResult(
    pageSize: number,
    took = 0,
    parsed?: ParsedQuery,
  ): SearchResponse {
    const meta: SearchMeta = {
      total: 0,
      nextCursor: null,
      pageSize,
      hasNextPage: false,
      took,
      query: parsed
        ? {
            filters: parsed.filters.length,
            hasSort: parsed.sort !== null,
            errors: toParseErrors(parsed.errors),
          }
        : { filters: 0, hasSort: false, errors: [] },
    };
    return { items: [], meta };
  }
}
