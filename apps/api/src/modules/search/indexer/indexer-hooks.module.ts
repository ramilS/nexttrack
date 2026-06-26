import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IndexerHooksService } from './indexer-hooks.service';
import { SEARCH_INDEXING_QUEUE } from './indexing-queue';

/**
 * Leaf module exposing the "this issue's indexed data changed, re-index it"
 * hook. Kept separate from SearchModule (which imports CustomFieldsModule,
 * TagsModule, …) so any module — including those SearchModule already depends
 * on — can trigger a re-index without a circular import. Only depends on the
 * BullMQ queue registration.
 */
@Module({
  imports: [BullModule.registerQueue({ name: SEARCH_INDEXING_QUEUE })],
  providers: [IndexerHooksService],
  exports: [IndexerHooksService, BullModule],
})
export class IndexerHooksModule {}
