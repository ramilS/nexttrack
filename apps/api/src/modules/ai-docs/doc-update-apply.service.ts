import { Injectable, Logger } from '@nestjs/common';
import { IssuesService } from '@/modules/issues/issues.service';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { KnowledgeBaseReader } from '@/modules/knowledge-base/knowledge-base.reader';
import { KnowledgeBaseService } from '@/modules/knowledge-base/knowledge-base.service';
import type { ProjectEntity } from '@/modules/projects/projects.repository';
import type { TiptapDoc } from '@repo/shared/schemas';
import { canonicalTiptapHash } from './canonical-hash';
import { DocMergeService } from './doc-merge.service';
import { PromptResolver } from './prompt-resolver.service';
import {
  DocUpdateProposalRepository,
  type DocUpdateProposalRecord,
} from './doc-update-proposal.repository';

export type ApplyOutcome = 'applied' | 'conflict_reopened';

const EMPTY_DOC: TiptapDoc = { type: 'doc' };

/**
 * Staleness-aware application of an accepted doc-update proposal (invoked when a
 * doc-update issue reaches Done). The OCC base captured at draft time guards
 * against silently overwriting human edits made in the meantime — see the
 * Concurrency section of the design.
 */
@Injectable()
export class DocUpdateApplyService {
  private readonly logger = new Logger(DocUpdateApplyService.name);

  constructor(
    private readonly kbReader: KnowledgeBaseReader,
    private readonly kb: KnowledgeBaseService,
    private readonly merge: DocMergeService,
    private readonly prompts: PromptResolver,
    private readonly proposals: DocUpdateProposalRepository,
    private readonly issues: IssuesService,
    private readonly workflows: WorkflowsReader,
  ) {}

  async apply(
    proposal: DocUpdateProposalRecord,
    project: ProjectEntity,
    docIssueNumber: number,
    userId: string,
  ): Promise<ApplyOutcome> {
    const target = proposal.targetArticleId;

    // New article, or target was deleted since drafting: just create it.
    const current = target
      ? await this.kbReader.findById(project.id, target)
      : null;
    if (!target || !current) {
      await this.createOrReplace(project.id, null, proposal, proposal.proposedContent, userId);
      return 'applied';
    }

    const currentSha = canonicalTiptapHash(current.content ?? EMPTY_DOC);
    const unchanged =
      proposal.baseArticleSha !== null && currentSha === proposal.baseArticleSha;

    if (unchanged) {
      await this.createOrReplace(project.id, target, proposal, proposal.proposedContent, userId);
      return 'applied';
    }

    // The article changed since the draft — attempt an AI three-way merge.
    const { merge: mergePrompt } = await this.prompts.forProject(project.id);
    const merged = await this.merge.merge(
      {
        currentContent: current.content ?? EMPTY_DOC,
        proposedContent: proposal.proposedContent,
        rationale: proposal.rationale,
      },
      mergePrompt,
    );

    if (merged && !merged.overlap) {
      await this.createOrReplace(project.id, target, proposal, merged.merged, userId);
      return 'applied';
    }

    // Overlapping edits (or merge unavailable): never overwrite. Persist the
    // best reconciled draft, re-baseline so a clean re-Done applies it, and
    // reopen the doc-issue for human review.
    await this.proposals.recordConflictResolution(
      proposal.id,
      merged?.merged ?? proposal.proposedContent,
      currentSha,
      new Date(),
    );
    await this.reopenForReview(project, docIssueNumber, userId);
    return 'conflict_reopened';
  }

  private async createOrReplace(
    projectId: string,
    targetArticleId: string | null,
    proposal: DocUpdateProposalRecord,
    content: TiptapDoc,
    userId: string,
  ): Promise<void> {
    await this.kb.applyAiDraft(
      projectId,
      targetArticleId,
      proposal.proposedTitle,
      content,
      userId,
    );
    await this.proposals.markApplied(proposal.id, new Date());
  }

  /**
   * Best-effort reopen: the conflict state is already durably persisted on the
   * proposal before this runs, so a blocked workflow transition (or any reopen
   * failure) must not wedge the listener — log and move on.
   */
  private async reopenForReview(
    project: ProjectEntity,
    docIssueNumber: number,
    userId: string,
  ): Promise<void> {
    try {
      const statuses = await this.workflows.findDefaultStatuses(project.id);
      const initial = statuses.find((s) => s.isInitial);
      if (!initial) return;
      await this.issues.update(project, docIssueNumber, { statusId: initial.id }, userId);
    } catch (err) {
      this.logger.warn(
        `Could not reopen doc-issue #${docIssueNumber} for review: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
