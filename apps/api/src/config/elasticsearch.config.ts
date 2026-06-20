import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  url: z.string(),
  indexPrefix: z.string().default('nexttrack'),
  requestTimeout: z.coerce.number().default(5000),
  maxRetries: z.coerce.number().default(3),
  searchDefaultPageSize: z.coerce.number().default(25),
  searchMaxPageSize: z.coerce.number().default(100),
  autocompleteCacheTtl: z.coerce.number().default(60),
  indexerBatchSize: z.coerce.number().default(100),
});

export type ElasticsearchConfig = z.infer<typeof schema>;

export const elasticsearchConfig = registerAs(
  'elasticsearch',
  (): ElasticsearchConfig => {
    return schema.parse({
      url: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
      indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX,
      requestTimeout: process.env.ELASTICSEARCH_REQUEST_TIMEOUT,
      maxRetries: process.env.ELASTICSEARCH_MAX_RETRIES,
      searchDefaultPageSize: process.env.SEARCH_DEFAULT_PAGE_SIZE,
      searchMaxPageSize: process.env.SEARCH_MAX_PAGE_SIZE,
      autocompleteCacheTtl: process.env.AUTOCOMPLETE_CACHE_TTL,
      indexerBatchSize: process.env.INDEXER_BATCH_SIZE,
    });
  },
);
