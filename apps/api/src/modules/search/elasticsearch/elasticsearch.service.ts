import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { elasticsearchConfig } from '@/config';
import { ISSUES_INDEX_SUFFIX, ISSUES_MAPPING } from './indices/issues.index';
import { AppLogger } from '@/common/logging/app-logger';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private readonly logger = new AppLogger(ElasticsearchService.name);
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
    try {
      const result = await this.client.index(params);
      this.logger.debug('ES document indexed', {
        index: params.index,
        id: params.id,
      });
      return result;
    } catch (err) {
      this.logger.error('ES index failed', err, {
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
      this.logger.debug('ES document deleted', {
        index: params.index,
        id: params.id,
      });
      return result;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      ) {
        this.logger.debug('ES delete skipped — document not found', {
          index: params.index,
          id: params.id,
        });
        return;
      }
      this.logger.error('ES delete failed', err, {
        index: params.index,
        id: params.id,
      });
      throw err;
    }
  }

  async search(params: Record<string, unknown>) {
    try {
      const result = await this.client.search(params);
      return result;
    } catch (err) {
      this.logger.error('ES search failed', err, { index: params.index });
      throw err;
    }
  }

  async bulk(params: { operations: unknown[] }) {
    try {
      const result = await this.client.bulk(params);
      this.logger.log('ES bulk executed', {
        operations: params.operations.length,
      });
      return result;
    } catch (err) {
      this.logger.error('ES bulk failed', err, {
        operations: params.operations.length,
      });
      throw err;
    }
  }

  async deleteByQuery(params: { index: string; query: Record<string, unknown> }) {
    try {
      const result = await this.client.deleteByQuery({
        index: params.index,
        query: params.query,
      });
      this.logger.log('ES deleteByQuery executed', { index: params.index });
      return result;
    } catch (err) {
      this.logger.error('ES deleteByQuery failed', err, { index: params.index });
      throw err;
    }
  }

  async count(params: { index: string; query?: Record<string, unknown> }) {
    return this.client.count(params);
  }

  getClient(): Client {
    return this.client;
  }
}
