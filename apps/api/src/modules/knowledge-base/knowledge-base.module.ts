import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseRepository } from './knowledge-base.repository';

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, KnowledgeBaseRepository],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
