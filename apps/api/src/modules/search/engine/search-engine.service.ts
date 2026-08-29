import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { searchEngineConfig } from '@/config';
import { ISSUES_INDEX_SUFFIX, ISSUES_MAPPING } from './indices/issues.index';
import { AppLogger } from '@/common/logging/app-logger';

/**
 * Hit shape the engine returns. Owned here rather than imported from the
 * client so the vendor's response format stops at this boundary.
 */
export interface SearchEngineHit {
  _id: string;
  _score: number | null;
  sort?: unknown[];
  highlight?: {
    title?: string[];
    description?: string[];
    commentBodies?: string[];
  };
}

export interface SearchEngineResult {
  hits?: {
    hits?: SearchEngineHit[];
    total?: number | { value: number };
  };
}

export interface BulkResult {
  items?: { index?: { error?: unknown } }[];
}

/**
 * The single place that talks to the search engine. Callers pass domain-level
 * params and receive unwrapped bodies — the client's `{ body }` envelope never
 * escapes this class, so swapping the engine again stays a one-file change.
 */
@Injectable()
export class SearchEngineService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private readonly logger = new AppLogger(SearchEngineService.name);
  readonly issuesIndex: string;

  constructor(
    @Inject(searchEngineConfig.KEY)
    private config: ConfigType<typeof searchEngineConfig>,
  ) {
    this.client = new Client({
      node: config.url,
      requestTimeout: config.requestTimeout,
      maxRetries: config.maxRetries,
    });
    this.issuesIndex = `${config.indexPrefix}_${ISSUES_INDEX_SUFFIX}`;
  }

  async onModuleInit() {
    try {
      const exists = await this.client.indices.exists({
        index: this.issuesIndex,
      });

      if (!exists.body) {
        await this.client.indices.create({
          index: this.issuesIndex,
          body: ISSUES_MAPPING,
        });
        this.logger.log(`Created index: ${this.issuesIndex}`);
      }
    } catch (err) {
      this.logger.warn(
        `Search engine init failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async index(params: {
    index: string;
    id: string;
    document: Record<string, unknown>;
    refresh?: 'wait_for' | boolean;
  }) {
    try {
      const result = await this.client.index({
        index: params.index,
        id: params.id,
        body: params.document,
        refresh: params.refresh,
      });
      this.logger.debug('Document indexed', {
        index: params.index,
        id: params.id,
      });
      return result.body;
    } catch (err) {
      this.logger.error('Index failed', err, {
        index: params.index,
        id: params.id,
      });
      throw err;
    }
  }

  async delete(params: {
    index: string;
    id: string;
    refresh?: 'wait_for' | boolean;
  }) {
    try {
      const result = await this.client.delete(params);
      this.logger.debug('Document deleted', {
        index: params.index,
        id: params.id,
      });
      return result.body;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      ) {
        this.logger.debug('Delete skipped — document not found', {
          index: params.index,
          id: params.id,
        });
        return;
      }
      this.logger.error('Delete failed', err, {
        index: params.index,
        id: params.id,
      });
      throw err;
    }
  }

  async search(
    params: { index: string } & Record<string, unknown>,
  ): Promise<SearchEngineResult> {
    // `index` addresses the URL; everything else is the query DSL body.
    const { index, ...body } = params;
    try {
      const result = await this.client.search({ index, body });
      // The client types the body against its own generated Hit shape, which
      // is wider than what the search pipeline reads. Narrowing happens here,
      // once, so no caller needs to know the engine's response type.
      const responseBody: unknown = result.body;
      return responseBody as SearchEngineResult;
    } catch (err) {
      this.logger.error('Search failed', err, { index: params.index });
      throw err;
    }
  }

  async bulk(params: { operations: unknown[] }): Promise<BulkResult> {
    try {
      const result = await this.client.bulk({
        body: params.operations as Record<string, unknown>[],
      });
      this.logger.log('Bulk executed', {
        operations: params.operations.length,
      });
      const responseBody: unknown = result.body;
      return responseBody as BulkResult;
    } catch (err) {
      this.logger.error('Bulk failed', err, {
        operations: params.operations.length,
      });
      throw err;
    }
  }

  /** Cluster reachability probe for the readiness endpoint. */
  async ping(): Promise<void> {
    await this.client.cluster.health();
  }
}
