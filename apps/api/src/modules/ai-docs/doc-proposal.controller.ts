import { Controller, Get, Param } from '@nestjs/common';
import { Permission } from '@repo/shared';
import type { DocProposalView } from '@repo/shared/schemas';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { DocUpdateProposalRepository } from './doc-update-proposal.repository';

/** Exposes the AI doc-update proposal carried by a doc-update issue (review panel). */
@Controller('issues/:issueId/doc-proposal')
@IssueAuth()
export class DocProposalController {
  constructor(private readonly proposals: DocUpdateProposalRepository) {}

  @Get()
  @RequirePermission(Permission.ARTICLE_READ)
  async get(@Param('issueId') issueId: string): Promise<DocProposalView | null> {
    const proposal = await this.proposals.findByDocIssueId(issueId);
    if (!proposal) return null;

    return {
      id: proposal.id,
      status: proposal.status,
      rationale: proposal.rationale,
      proposedTitle: proposal.proposedTitle,
      proposedContent: proposal.proposedContent,
      targetArticleId: proposal.targetArticleId,
      hasConflict: proposal.conflictResolvedAt !== null,
      createdAt: proposal.createdAt.toISOString(),
    };
  }
}
