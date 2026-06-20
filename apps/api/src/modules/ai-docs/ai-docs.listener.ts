import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { DocUpdateProposalStatus } from '@prisma/client';
import { aiDocsConfig } from '@/config';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import { IssueUpdatedEvent } from '@/modules/issues/events/issue.events';
import { DOC_GEN_QUEUE, type DocGenJobData } from './ai-docs.constants';
import { isDocCandidate } from './candidate-gate';
import { DocUpdateApplyService } from './doc-update-apply.service';
import {
  DocUpdateProposalRepository,
  type DocUpdateProposalRecord,
} from './doc-update-proposal.repository';

/**
 * Drives the AI-docs flow off issue resolution. A doc-update issue is
 * recognised by having a proposal (the recursion guard): resolving it applies
 * or rejects the draft. Any other resolved issue that passes the candidate gate
 * is queued for AI suggestion. Errors propagate so the outbox retries; the
 * side effects are idempotent (proposal-status gate + BullMQ jobId dedup).
 */
@Injectable()
export class AiDocsListener {
  private readonly logger = new Logger(AiDocsListener.name);

  constructor(
    @Inject(aiDocsConfig.KEY)
    private readonly config: ConfigType<typeof aiDocsConfig>,
    private readonly proposals: DocUpdateProposalRepository,
    private readonly issuesReader: IssuesReader,
    private readonly projects: ProjectsRepository,
    private readonly applyService: DocUpdateApplyService,
    @InjectQueue(DOC_GEN_QUEUE) private readonly queue: Queue<DocGenJobData>,
  ) {}

  @OnEvent('issue.updated')
  async handleIssueUpdated(
    event: IssueUpdatedEvent & DomainEventMeta,
  ): Promise<void> {
    if (!this.config.enabled) return;

    const justResolved = this.isJustResolved(event);

    const proposal = await this.proposals.findByDocIssueId(event.issueId);
    if (proposal) {
      // This is a doc-update issue (recursion guard). Act only on the first
      // resolution while still pending.
      if (justResolved && proposal.status === DocUpdateProposalStatus.PENDING) {
        await this.resolveDocIssue(event, proposal);
      }
      return;
    }

    if (!justResolved) return;
    if (!(await this.isCandidate(event))) return;
    if (await this.proposals.hasPendingForSource(event.issueId)) return;

    await this.queue.add(
      'generate',
      {
        sourceIssueId: event.issueId,
        projectId: event.projectId,
        userId: event.userId,
      },
      { jobId: `docgen:${event.issueId}` },
    );
  }

  private isJustResolved(event: IssueUpdatedEvent): boolean {
    const newStatusId = event.changes.statusId;
    if (!newStatusId || newStatusId === event.previous.statusId) return false;
    const newStatus = event.statuses.find((s) => s.id === newStatusId);
    return !!newStatus?.isResolved && !event.previous.resolvedAt;
  }

  private async resolveDocIssue(
    event: IssueUpdatedEvent,
    proposal: DocUpdateProposalRecord,
  ): Promise<void> {
    const newStatus = event.statuses.find(
      (s) => s.id === event.changes.statusId,
    );
    if (newStatus && this.isRejectionStatus(newStatus.name)) {
      await this.proposals.markRejected(proposal.id);
      this.logger.log(`Doc-update issue ${event.issueId} cancelled; proposal rejected`);
      return;
    }

    const project = await this.projects.findActiveById(proposal.projectId);
    if (!project) return;

    const outcome = await this.applyService.apply(
      proposal,
      project,
      event.number,
      event.userId,
    );
    this.logger.log(`Doc-update issue ${event.issueId} resolved: ${outcome}`);
  }

  private isRejectionStatus(name: string): boolean {
    const lower = name.toLowerCase();
    return this.config.rejectionStatusNames.some(
      (n) => n.toLowerCase() === lower,
    );
  }

  private async isCandidate(event: IssueUpdatedEvent): Promise<boolean> {
    const source = await this.issuesReader.findDocContext(event.issueId);
    if (!source) return false;
    const tagNames = await this.issuesReader.findTagNames(event.issueId);
    return isDocCandidate({
      type: source.type,
      description: source.description,
      tagNames,
      triggerTag: this.config.triggerTag,
    });
  }
}
