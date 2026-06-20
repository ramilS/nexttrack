import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { IssueType, Priority } from '@prisma/client';
import { AppLogger } from '@/common/logging/app-logger';
import { aiDocsConfig } from '@/config';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { IssuesService } from '@/modules/issues/issues.service';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { KnowledgeBaseReader } from '@/modules/knowledge-base/knowledge-base.reader';
import type { TiptapDoc } from '@repo/shared/schemas';
import { DOC_GEN_QUEUE, type DocGenJobData } from './ai-docs.constants';
import { canonicalTiptapHash } from './canonical-hash';
import { DocSuggestionService } from './doc-suggestion.service';
import { DocUpdateProposalRepository } from './doc-update-proposal.repository';
import { PromptResolver } from './prompt-resolver.service';

const EMPTY_DOC: TiptapDoc = { type: 'doc' };

function buildDescriptionDoc(
  rationale: string,
  sourceKey: string,
): TiptapDoc {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: rationale }] },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Proposed by AI from resolved issue ${sourceKey}. Move this issue to Done to apply the documentation change, or cancel it to discard.`,
          },
        ],
      },
    ],
  };
}

/**
 * Generates an AI documentation suggestion for a resolved issue and, if
 * warranted, materializes it as a doc-update issue + a PENDING proposal. The
 * proposal carries the draft and the OCC base; the listener applies it when the
 * doc-update issue reaches Done.
 */
@Processor(DOC_GEN_QUEUE)
@Injectable()
export class DocGenerationProcessor extends WorkerHost {
  private readonly logger = new AppLogger(DocGenerationProcessor.name);

  constructor(
    private readonly issuesReader: IssuesReader,
    private readonly kbReader: KnowledgeBaseReader,
    private readonly suggestion: DocSuggestionService,
    private readonly prompts: PromptResolver,
    private readonly proposals: DocUpdateProposalRepository,
    private readonly issues: IssuesService,
    private readonly projects: ProjectsRepository,
    @Inject(aiDocsConfig.KEY)
    private readonly config: ConfigType<typeof aiDocsConfig>,
  ) {
    super();
  }

  async process(job: Job<DocGenJobData>): Promise<void> {
    const { sourceIssueId, projectId, userId } = job.data;
    // ALS context is lost across the BullMQ boundary — log payload ids explicitly.
    this.logger.log('Doc-generation job started', {
      jobId: job.id,
      sourceIssueId,
      projectId,
      userId,
    });

    // Idempotency: a proposal already exists for this source issue.
    if (await this.proposals.hasPendingForSource(sourceIssueId)) {
      this.logger.debug('Doc-generation skipped: pending proposal already exists', {
        sourceIssueId,
        projectId,
      });
      return;
    }

    const source = await this.issuesReader.findDocContext(sourceIssueId);
    if (!source) {
      this.logger.warn('Doc-generation skipped: source issue not found', {
        sourceIssueId,
        projectId,
      });
      return;
    }

    const project = await this.projects.findActiveById(projectId);
    if (!project) {
      this.logger.warn('Doc-generation skipped: project not found or archived', {
        sourceIssueId,
        projectId,
      });
      return;
    }

    const candidates = await this.kbReader.listForProject(
      projectId,
      this.config.maxCandidateArticles,
    );

    const sourceKey = `${project.key}-${source.number}`;
    const { suggestion: suggestionPrompt } = await this.prompts.forProject(projectId);
    const suggestion = await this.suggestion.suggest(
      {
        issueKey: sourceKey,
        issueTitle: source.title,
        issueType: source.type,
        issueDescription: source.description,
        candidates: candidates.map((c) => ({
          id: c.id,
          title: c.title,
          content: c.content,
        })),
      },
      suggestionPrompt,
    );
    if (!suggestion) {
      this.logger.log('AI declined doc update (no suggestion / unusable output)', {
        sourceIssueId,
        projectId,
        sourceKey,
      });
      return;
    }

    const base = await this.captureBase(projectId, suggestion.targetArticleId);

    const docIssue = await this.issues.create(
      project,
      {
        title: `Update docs: ${suggestion.proposedTitle}`,
        description: buildDescriptionDoc(suggestion.rationale, sourceKey),
        type: IssueType.TASK,
        priority: Priority.MEDIUM,
      },
      userId,
    );

    const proposal = await this.proposals.create({
      projectId,
      sourceIssueId,
      docIssueId: docIssue.id,
      targetArticleId: suggestion.targetArticleId,
      proposedTitle: suggestion.proposedTitle,
      proposedContent: suggestion.proposedContent,
      rationale: suggestion.rationale,
      baseArticleSha: base.sha,
      baseArticleUpdatedAt: base.updatedAt,
    });

    this.logger.log('Created doc-update issue from AI suggestion', {
      sourceIssueId,
      projectId,
      docIssueId: docIssue.id,
      docIssueKey: `${project.key}-${docIssue.number}`,
      proposalId: proposal.id,
      targetArticleId: suggestion.targetArticleId,
    });
  }

  private async captureBase(
    projectId: string,
    targetArticleId: string | null,
  ): Promise<{ sha: string | null; updatedAt: Date | null }> {
    if (!targetArticleId) return { sha: null, updatedAt: null };
    const target = await this.kbReader.findById(projectId, targetArticleId);
    if (!target) return { sha: null, updatedAt: null };
    return {
      sha: canonicalTiptapHash(target.content ?? EMPTY_DOC),
      updatedAt: new Date(target.updatedAt),
    };
  }
}
