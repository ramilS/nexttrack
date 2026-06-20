import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IssuesModule } from '@/modules/issues/issues.module';
import { KnowledgeBaseModule } from '@/modules/knowledge-base/knowledge-base.module';
import { DOC_GEN_QUEUE } from './ai-docs.constants';
import { structuredLlmProvider } from './llm/llm.provider';
import { DocUpdateProposalRepository } from './doc-update-proposal.repository';
import { AiDocsSettingsRepository } from './ai-docs-settings.repository';
import { PromptResolver } from './prompt-resolver.service';
import { DocSuggestionService } from './doc-suggestion.service';
import { DocMergeService } from './doc-merge.service';
import { DocUpdateApplyService } from './doc-update-apply.service';
import { DocGenerationProcessor } from './doc-generation.processor';
import { AiDocsListener } from './ai-docs.listener';
import { AiDocsController } from './ai-docs.controller';
import { DocProposalController } from './doc-proposal.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: DOC_GEN_QUEUE }),
    IssuesModule,
    KnowledgeBaseModule,
  ],
  controllers: [AiDocsController, DocProposalController],
  providers: [
    structuredLlmProvider,
    DocUpdateProposalRepository,
    AiDocsSettingsRepository,
    PromptResolver,
    DocSuggestionService,
    DocMergeService,
    DocUpdateApplyService,
    DocGenerationProcessor,
    AiDocsListener,
  ],
})
export class AiDocsModule {}
