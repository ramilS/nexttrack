import { Module } from '@nestjs/common';
import { SearchEngineService } from './search-engine.service';
import { SearchQueryBuilderService } from './search-query-builder.service';

@Module({
  providers: [SearchEngineService, SearchQueryBuilderService],
  exports: [SearchEngineService, SearchQueryBuilderService],
})
export class SearchEngineModule {}
