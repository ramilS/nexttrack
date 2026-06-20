import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRepository } from './search.repository';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { IssueIndexerService } from './indexer/issue-indexer.service';
import { AutocompleteService } from './query-language/autocomplete.service';
import { IndexerHooksService } from './indexer/indexer-hooks.service';
import { IssueIndexingProcessor } from './indexer/issue-indexing.processor';
import { SEARCH_INDEXING_QUEUE } from './indexer/indexing-queue';
import { UsersModule } from '@/modules/users/users.module';
import { WorkflowsModule } from '@/modules/workflows/workflows.module';
import { TagsModule } from '@/modules/tags/tags.module';
import { VersionsModule } from '@/modules/versions/versions.module';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SEARCH_INDEXING_QUEUE }),
    ElasticsearchModule,
    UsersModule,
    WorkflowsModule,
    TagsModule,
    VersionsModule,
    CustomFieldsModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    IssueIndexerService,
    AutocompleteService,
    IndexerHooksService,
    IssueIndexingProcessor,
  ],
  exports: [
    SearchService,
    IssueIndexerService,
    IndexerHooksService,
    ElasticsearchModule,
  ],
})
export class SearchModule {}
