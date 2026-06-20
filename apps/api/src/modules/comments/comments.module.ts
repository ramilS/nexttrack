import { Module } from '@nestjs/common';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentsRepository } from './comments.repository';
import { IssuesModule } from '@/modules/issues/issues.module';

@Module({
  imports: [IssuesModule, OutboxModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
