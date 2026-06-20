import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { DomainEventPublisher } from '@/modules/outbox/domain-event-publisher';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { CommentsService } from './comments.service';
import {
  CommentsRepository,
  type RawComment,
  type RawCommentWithReplies,
} from './comments.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepo: jest.Mocked<CommentsRepository>;
  let issuesRepo: jest.Mocked<IssuesReader>;
  let domainEvents: { publish: jest.Mock };
  let txService: { run: jest.Mock };

  const baseRaw: RawComment = {
    id: 'c1',
    issueId: 'issue-1',
    parentId: null,
    authorId: 'user-1',
    author: { id: 'user-1', name: 'Test', email: 't@t.local', avatarUrl: null },
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    isDeleted: false,
    editedAt: null,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
  };

  const rawWithReplies = (overrides?: Partial<RawCommentWithReplies>): RawCommentWithReplies => ({
    ...baseRaw,
    replies: [],
    ...overrides,
  });

  beforeEach(async () => {
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    txService = {
      run: jest.fn().mockImplementation(<T,>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx)),
    };

    const commentsRepoMock: jest.Mocked<CommentsRepository> = {
      findTopLevelByIssue: jest.fn(),
      findById: jest.fn(),
      findActiveById: jest.fn(),
      isValidReplyParent: jest.fn(),
      create: jest.fn(),
      updateBody: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CommentsRepository>;

    const issuesRepoMock: jest.Mocked<IssuesReader> = {
      findProjectIdById: jest.fn(),
      findIssueRef: jest.fn(),
    } as unknown as jest.Mocked<IssuesReader>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: CommentsRepository, useValue: commentsRepoMock },
        { provide: IssuesReader, useValue: issuesRepoMock },
        { provide: TransactionService, useValue: txService },
        { provide: DomainEventPublisher, useValue: domainEvents },
      ],
    }).compile();

    service = module.get(CommentsService);
    commentsRepo = module.get(CommentsRepository);
    issuesRepo = module.get(IssuesReader);
  });

  describe('findByIssue', () => {
    it('should return decorated comments with canEdit/canDelete flags', async () => {
      commentsRepo.findTopLevelByIssue.mockResolvedValue({
        items: [rawWithReplies()],
        meta: { nextCursor: null, hasNextPage: false, pageSize: 50 },
      });

      const result = await service.findByIssue('issue-1', 'user-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.canEdit).toBe(true);
      expect(result.items[0]!.canDelete).toBe(true);
    });

    it('should set canEdit=false for non-author non-admin', async () => {
      commentsRepo.findTopLevelByIssue.mockResolvedValue({
        items: [rawWithReplies()],
        meta: { nextCursor: null, hasNextPage: false, pageSize: 50 },
      });

      const result = await service.findByIssue('issue-1', 'other-user');

      expect(result.items[0]!.canEdit).toBe(false);
      expect(result.items[0]!.canDelete).toBe(false);
    });
  });

  describe('create', () => {
    const dto = { body: { type: 'doc' as const, content: [] } };

    it('should create comment and emit event', async () => {
      issuesRepo.findIssueRef.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1', title: 'Issue' });
      commentsRepo.create.mockResolvedValue(baseRaw);

      const result = await service.create('issue-1', 'user-1', dto);

      expect(result.id).toBe('c1');
      expect(commentsRepo.create).toHaveBeenCalledWith({
        issueId: 'issue-1',
        authorId: 'user-1',
        parentId: null,
        body: dto.body,
      }, expect.anything());
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'comment.created',
          payload: expect.objectContaining({
            commentId: 'c1',
            issueId: 'issue-1',
            projectId: 'proj-1',
            userId: 'user-1',
            body: dto.body,
            issueTitle: 'Issue',
          }),
        }),
        expect.anything(),
      );
    });

    it('should throw NotFoundError for missing issue', async () => {
      issuesRepo.findIssueRef.mockResolvedValue(null);

      await expect(service.create('missing', 'user-1', dto)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for missing parent comment', async () => {
      issuesRepo.findIssueRef.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1', title: 'Issue' });
      commentsRepo.isValidReplyParent.mockResolvedValue({ exists: false, isTopLevel: false });

      await expect(
        service.create('issue-1', 'user-1', { ...dto, parentId: 'missing-parent' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when replying to a reply', async () => {
      issuesRepo.findIssueRef.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1', title: 'Issue' });
      commentsRepo.isValidReplyParent.mockResolvedValue({ exists: true, isTopLevel: false });

      await expect(
        service.create('issue-1', 'user-1', { ...dto, parentId: 'reply-id' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    const dto = { body: { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] } };

    it('should update comment by author and emit event', async () => {
      commentsRepo.findById.mockResolvedValue(baseRaw);
      commentsRepo.updateBody.mockResolvedValue({ ...baseRaw, body: dto.body });

      await service.update('c1', 'user-1', dto, false);

      expect(commentsRepo.updateBody).toHaveBeenCalledWith('c1', dto.body, expect.anything());
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'comment.updated',
          payload: expect.objectContaining({
            commentId: 'c1',
            issueId: 'issue-1',
            userId: 'user-1',
            newBody: dto.body,
          }),
        }),
        expect.anything(),
      );
    });

    it('should allow admin to update any comment', async () => {
      commentsRepo.findById.mockResolvedValue(baseRaw);
      commentsRepo.updateBody.mockResolvedValue(baseRaw);

      await service.update('c1', 'other-user', dto, true);

      expect(commentsRepo.updateBody).toHaveBeenCalled();
    });

    it('should throw NotFoundError for missing comment', async () => {
      commentsRepo.findById.mockResolvedValue(null);

      await expect(service.update('missing', 'user-1', dto, false)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for deleted comment', async () => {
      commentsRepo.findById.mockResolvedValue({ ...baseRaw, isDeleted: true });

      await expect(service.update('c1', 'user-1', dto, false)).rejects.toThrow(ValidationError);
    });

    it('should throw PermissionDeniedError for non-author non-admin', async () => {
      commentsRepo.findById.mockResolvedValue(baseRaw);

      await expect(service.update('c1', 'other-user', dto, false)).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('softDelete', () => {
    it('should soft-delete comment and emit event', async () => {
      commentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await service.softDelete('c1', 'user-1', false);

      expect(commentsRepo.softDelete).toHaveBeenCalledWith('c1', 'user-1', expect.anything());
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'comment.deleted',
          payload: expect.objectContaining({
            commentId: 'c1',
            issueId: 'issue-1',
            userId: 'user-1',
          }),
        }),
        expect.anything(),
      );
    });

    it('should allow admin to delete any comment', async () => {
      commentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await service.softDelete('c1', 'other-user', true);

      expect(commentsRepo.softDelete).toHaveBeenCalled();
    });

    it('should throw NotFoundError for missing comment', async () => {
      commentsRepo.findActiveById.mockResolvedValue(null);

      await expect(service.softDelete('missing', 'user-1', false)).rejects.toThrow(NotFoundError);
    });

    it('should throw PermissionDeniedError for non-author non-admin', async () => {
      commentsRepo.findActiveById.mockResolvedValue(baseRaw);

      await expect(service.softDelete('c1', 'other-user', false)).rejects.toThrow(PermissionDeniedError);
    });
  });
});
