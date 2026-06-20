import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { EsQueryBuilderService } from './es-query-builder.service';

@Module({
  providers: [ElasticsearchService, EsQueryBuilderService],
  exports: [ElasticsearchService, EsQueryBuilderService],
})
export class ElasticsearchModule {}
