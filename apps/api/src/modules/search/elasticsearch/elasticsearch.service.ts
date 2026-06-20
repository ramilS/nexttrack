import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { elasticsearchConfig } from '@/config';
import { ISSUES_INDEX_SUFFIX, ISSUES_MAPPING } from './indices/issues.index';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private readonly logger = new Logger(ElasticsearchService.name);
  readonly issuesIndex: string;

  constructor(
    @Inject(elasticsearchConfig.KEY)
    private config: ConfigType<typeof elasticsearchConfig>,
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

      if (!exists) {
        await this.client.indices.create({
          index: this.issuesIndex,
          ...ISSUES_MAPPING,
        });
        this.logger.log(`Created index: ${this.issuesIndex}`);
      }
    } catch (err) {
      this.logger.warn(`ES init failed (non-fatal): ${(err as Error).message}`);
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
    return this.client.index(params);
  }

  async delete(params: {
    index: string;
    id: string;
    refresh?: 'wait_for' | boolean;
  }) {
    try {
      return await this.client.delete(params);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      ) {
        return;
      }
      throw err;
    }
  }

  async search(params: Record<string, unknown>) {
    return this.client.search(params);
  }

  async bulk(params: { operations: unknown[] }) {
    return this.client.bulk(params);
  }

  async deleteByQuery(params: { index: string; query: Record<string, unknown> }) {
    return this.client.deleteByQuery({
      index: params.index,
      query: params.query,
    });
  }

  async count(params: { index: string; query?: Record<string, unknown> }) {
    return this.client.count(params);
  }

  getClient(): Client {
    return this.client;
  }
}
