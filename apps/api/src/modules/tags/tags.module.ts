import { Module } from '@nestjs/common';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { TagsController } from './tags.controller';
import { IssueTagsController } from './issue-tags.controller';
import { TagsService } from './tags.service';
import { TagsRepository } from './tags.repository';

@Module({
  imports: [OutboxModule],
  controllers: [TagsController, IssueTagsController],
  providers: [TagsService, TagsRepository],
  exports: [TagsService, TagsRepository],
})
export class TagsModule {}
