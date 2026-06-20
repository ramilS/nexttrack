import { ConfigType } from '@nestjs/config';
import { DocUpdateProposalStatus } from '@prisma/client';
import type { aiDocsConfig } from '@/config';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import { IssueUpdatedEvent } from '@/modules/issues/events/issue.events';
import { AiDocsListener } from './ai-docs.listener';
import { buildDocUpdateProposal } from '@test/helpers';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const config = {
  enabled: true,
  provider: 'anthropic',
  apiKey: 'sk',
  model: 'claude-opus-4-8',
  triggerTag: 'docs',
  maxCandidateArticles: 8,
  rejectionStatusNames: ['Cancelled'],
} as ConfigType<typeof aiDocsConfig>;

const STATUSES = [
  { id: 'open', name: 'Open', isInitial: true, isResolved: false, color: '#ccc', category: 'UNSTARTED', ordinal: 0 },
  { id: 'done', name: 'Done', isInitial: false, isResolved: true, color: '#0a0', category: 'DONE', ordinal: 1 },
  { id: 'cancel', name: 'Cancelled', isInitial: false, isResolved: true, color: '#a00', category: 'DONE', ordinal: 2 },
];

function buildEvent(overrides: {
  issueId?: string;
  newStatusId: string;
  prevStatusId?: string;
  prevResolvedAt?: Date | null;
}): IssueUpdatedEvent & DomainEventMeta {
  return {
    issueId: overrides.issueId ?? 'issue-1',
    projectId: 'proj-1',
    number: 5,
    userId: 'user-1',
    changes: { statusId: overrides.newStatusId },
    previous: {
      statusId: overrides.prevStatusId ?? 'open',
      resolvedAt: overrides.prevResolvedAt ?? null,
    },
    statuses: STATUSES,
  } as unknown as IssueUpdatedEvent & DomainEventMeta;
}

describe('AiDocsListener', () => {
  let proposals: Mocked<{
    findByDocIssueId: jest.Mock;
    hasPendingForSource: jest.Mock;
    markRejected: jest.Mock;
  }>;
  let issuesReader: Mocked<{ findDocContext: jest.Mock; findTagNames: jest.Mock }>;
  let projects: Mocked<{ findActiveById: jest.Mock }>;
  let applyService: Mocked<{ apply: jest.Mock }>;
  let queue: Mocked<{ add: jest.Mock }>;

  function makeListener(cfg: ConfigType<typeof aiDocsConfig> = config) {
    return new AiDocsListener(
      cfg,
      proposals as never,
      issuesReader as never,
      projects as never,
      applyService as never,
      queue as never,
    );
  }

  beforeEach(() => {
    proposals = {
      findByDocIssueId: jest.fn().mockResolvedValue(null),
      hasPendingForSource: jest.fn().mockResolvedValue(false),
      markRejected: jest.fn().mockResolvedValue(undefined),
    };
    issuesReader = {
      findDocContext: jest.fn().mockResolvedValue({
        id: 'issue-1',
        number: 5,
        title: 'Add SSO',
        type: 'FEATURE',
        description: { type: 'doc', content: [{ type: 'paragraph' }] },
        projectId: 'proj-1',
      }),
      findTagNames: jest.fn().mockResolvedValue([]),
    };
    projects = { findActiveById: jest.fn().mockResolvedValue({ id: 'proj-1', key: 'DOC' }) };
    applyService = { apply: jest.fn().mockResolvedValue('applied') };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
  });

  it('does nothing when the feature is disabled', async () => {
    await makeListener({ ...config, enabled: false }).handleIssueUpdated(
      buildEvent({ newStatusId: 'done' }),
    );
    expect(proposals.findByDocIssueId).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing when the status change is not a resolution', async () => {
    await makeListener().handleIssueUpdated(
      buildEvent({ newStatusId: 'open', prevStatusId: 'open' }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues an AI suggestion for a resolved candidate issue', async () => {
    await makeListener().handleIssueUpdated(buildEvent({ newStatusId: 'done' }));

    expect(queue.add).toHaveBeenCalledWith(
      'generate',
      { sourceIssueId: 'issue-1', projectId: 'proj-1', userId: 'user-1' },
      { jobId: 'docgen:issue-1' },
    );
  });

  it('does not enqueue when a proposal already exists for the source', async () => {
    proposals.hasPendingForSource.mockResolvedValue(true);
    await makeListener().handleIssueUpdated(buildEvent({ newStatusId: 'done' }));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('applies the draft when a doc-update issue is moved to Done', async () => {
    proposals.findByDocIssueId.mockResolvedValue(
      buildDocUpdateProposal({ status: DocUpdateProposalStatus.PENDING }),
    );

    await makeListener().handleIssueUpdated(
      buildEvent({ issueId: 'doc-issue', newStatusId: 'done' }),
    );

    expect(applyService.apply).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects the proposal when a doc-update issue is moved to Cancelled', async () => {
    const proposal = buildDocUpdateProposal({ status: DocUpdateProposalStatus.PENDING });
    proposals.findByDocIssueId.mockResolvedValue(proposal);

    await makeListener().handleIssueUpdated(
      buildEvent({ issueId: 'doc-issue', newStatusId: 'cancel' }),
    );

    expect(proposals.markRejected).toHaveBeenCalledWith(proposal.id);
    expect(applyService.apply).not.toHaveBeenCalled();
  });

  it('ignores an already-resolved proposal (idempotent re-delivery)', async () => {
    proposals.findByDocIssueId.mockResolvedValue(
      buildDocUpdateProposal({ status: DocUpdateProposalStatus.ACCEPTED }),
    );

    await makeListener().handleIssueUpdated(
      buildEvent({ issueId: 'doc-issue', newStatusId: 'done' }),
    );

    expect(applyService.apply).not.toHaveBeenCalled();
    expect(proposals.markRejected).not.toHaveBeenCalled();
  });
});
