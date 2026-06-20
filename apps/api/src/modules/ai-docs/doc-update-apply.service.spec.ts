import { DocUpdateProposalStatus } from '@prisma/client';
import type { Article, TiptapDoc, WorkflowStatus } from '@repo/shared/schemas';
import type { ProjectEntity } from '@/modules/projects/projects.repository';
import { DocUpdateApplyService } from './doc-update-apply.service';
import { canonicalTiptapHash } from './canonical-hash';
import type { DocUpdateProposalRecord } from './doc-update-proposal.repository';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const project = { id: 'proj-1', key: 'DOC' } as ProjectEntity;

const draftDoc: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new docs' }] }],
};
const currentDoc: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'current docs' }] }],
};

function buildProposal(
  overrides?: Partial<DocUpdateProposalRecord>,
): DocUpdateProposalRecord {
  return {
    id: 'prop-1',
    projectId: project.id,
    sourceIssueId: 'src-1',
    docIssueId: 'doc-1',
    targetArticleId: 'art-1',
    proposedTitle: 'Authentication',
    proposedContent: draftDoc,
    rationale: 'SSO added.',
    status: DocUpdateProposalStatus.PENDING,
    baseArticleSha: canonicalTiptapHash(currentDoc),
    baseArticleUpdatedAt: new Date(),
    conflictResolvedAt: null,
    createdAt: new Date(),
    appliedAt: null,
    ...overrides,
  };
}

function buildArticle(content: TiptapDoc): Article {
  return {
    id: 'art-1',
    projectId: project.id,
    parentId: null,
    title: 'Authentication',
    slug: 'authentication',
    content,
    sortOrder: 0,
    publishedAt: null,
    archivedAt: null,
    createdBy: { id: 'u1', name: 'U', email: 'u@x', avatarUrl: null },
    updatedBy: null,
    commentsCount: 0,
    childrenCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('DocUpdateApplyService', () => {
  let kbReader: Mocked<{ findById: jest.Mock }>;
  let kb: Mocked<{ applyAiDraft: jest.Mock }>;
  let merge: Mocked<{ merge: jest.Mock }>;
  let proposals: Mocked<{
    markApplied: jest.Mock;
    recordConflictResolution: jest.Mock;
  }>;
  let issues: Mocked<{ update: jest.Mock }>;
  let workflows: Mocked<{ findDefaultStatuses: jest.Mock }>;
  let prompts: Mocked<{ forProject: jest.Mock }>;
  let service: DocUpdateApplyService;

  beforeEach(() => {
    kbReader = { findById: jest.fn() };
    kb = { applyAiDraft: jest.fn().mockResolvedValue(buildArticle(draftDoc)) };
    merge = { merge: jest.fn() };
    proposals = {
      markApplied: jest.fn().mockResolvedValue(undefined),
      recordConflictResolution: jest.fn().mockResolvedValue(undefined),
    };
    issues = { update: jest.fn().mockResolvedValue(undefined) };
    workflows = {
      findDefaultStatuses: jest.fn().mockResolvedValue([
        { id: 'open', name: 'Open', isInitial: true } as WorkflowStatus,
      ]),
    };
    prompts = {
      forProject: jest
        .fn()
        .mockResolvedValue({ suggestion: 'S', merge: 'M' }),
    };
    service = new DocUpdateApplyService(
      kbReader as never,
      kb as never,
      merge as never,
      prompts as never,
      proposals as never,
      issues as never,
      workflows as never,
    );
  });

  it('creates a new article when the proposal has no target', async () => {
    const outcome = await service.apply(
      buildProposal({ targetArticleId: null }),
      project,
      5,
      'user-1',
    );

    expect(outcome).toBe('applied');
    expect(kb.applyAiDraft).toHaveBeenCalledWith(
      project.id,
      null,
      'Authentication',
      draftDoc,
      'user-1',
    );
    expect(proposals.markApplied).toHaveBeenCalled();
    expect(merge.merge).not.toHaveBeenCalled();
  });

  it('applies the draft directly when the target article is unchanged', async () => {
    kbReader.findById.mockResolvedValue(buildArticle(currentDoc));

    const outcome = await service.apply(buildProposal(), project, 5, 'user-1');

    expect(outcome).toBe('applied');
    expect(merge.merge).not.toHaveBeenCalled();
    expect(kb.applyAiDraft).toHaveBeenCalledWith(
      project.id,
      'art-1',
      'Authentication',
      draftDoc,
      'user-1',
    );
  });

  it('auto-merges and applies when edits do not overlap', async () => {
    const edited = buildArticle({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited elsewhere' }] }],
    });
    kbReader.findById.mockResolvedValue(edited);
    const mergedDoc: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    merge.merge.mockResolvedValue({ merged: mergedDoc, overlap: false });

    const outcome = await service.apply(buildProposal(), project, 5, 'user-1');

    expect(outcome).toBe('applied');
    expect(kb.applyAiDraft).toHaveBeenCalledWith(
      project.id,
      'art-1',
      'Authentication',
      mergedDoc,
      'user-1',
    );
  });

  it('reopens the doc-issue without overwriting when edits overlap', async () => {
    const edited = buildArticle({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'human changed' }] }],
    });
    kbReader.findById.mockResolvedValue(edited);
    const mergedDoc: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    merge.merge.mockResolvedValue({ merged: mergedDoc, overlap: true });

    const outcome = await service.apply(buildProposal(), project, 5, 'user-1');

    expect(outcome).toBe('conflict_reopened');
    expect(kb.applyAiDraft).not.toHaveBeenCalled();
    expect(proposals.recordConflictResolution).toHaveBeenCalled();
    expect(issues.update).toHaveBeenCalledWith(
      project,
      5,
      { statusId: 'open' },
      'user-1',
    );
  });

  it('creates a new article when the target was deleted', async () => {
    kbReader.findById.mockResolvedValue(null);

    const outcome = await service.apply(buildProposal(), project, 5, 'user-1');

    expect(outcome).toBe('applied');
    expect(kb.applyAiDraft).toHaveBeenCalledWith(
      project.id,
      null,
      'Authentication',
      draftDoc,
      'user-1',
    );
  });
});
