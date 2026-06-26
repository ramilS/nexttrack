import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRepository } from './search.repository';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { IssueIndexerService } from './indexer/issue-indexer.service';
import { AutocompleteService } from './query-language/autocomplete.service';
import { IndexerHooksModule } from './indexer/indexer-hooks.module';
import { IssueIndexingProcessor } from './indexer/issue-indexing.processor';
import { UsersModule } from '@/modules/users/users.module';
import { WorkflowsModule } from '@/modules/workflows/workflows.module';
import { TagsModule } from '@/modules/tags/tags.module';
import { VersionsModule } from '@/modules/versions/versions.module';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';

@Module({
  imports: [
    IndexerHooksModule,
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
    IssueIndexingProcessor,
  ],
  exports: [
    SearchService,
    IssueIndexerService,
    // Re-export so existing consumers that import SearchModule still resolve
    // IndexerHooksService.
    IndexerHooksModule,
    ElasticsearchModule,
  ],
})
export class SearchModule {}
