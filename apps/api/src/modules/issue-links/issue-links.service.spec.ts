import { Test, TestingModule } from '@nestjs/testing';
import { ConflictError, NotFoundError } from '@/common/errors/domain.errors';
import { IssueLinkType } from '@prisma/client';
import { IssueLinksService } from './issue-links.service';
import {
  IssueLinksRepository,
  IssueLinkRow,
} from './issue-links.repository';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { ErrorCode } from '@repo/shared/error-codes';
import { buildIssueLink, resetFactoryCounter } from '@test/helpers';

const mockWorkflow = { statuses: [] };
const mockProject = (key: string) => ({ key, workflows: [mockWorkflow] });

function mockLinkRow(overrides: Partial<IssueLinkRow> & { sourceIssueId: string; targetIssueId: string; type: IssueLinkType }): IssueLinkRow {
  const base = buildIssueLink({
    sourceIssueId: overrides.sourceIssueId,
    targetIssueId: overrides.targetIssueId,
    type: overrides.type,
  });
  return {
    ...base,
    sourceIssue: { id: overrides.sourceIssueId, number: 1, title: 'Source', statusId: 's1', priority: 'MEDIUM', type: 'TASK', project: mockProject('PRJ') },
    targetIssue: { id: overrides.targetIssueId, number: 2, title: 'Target', statusId: 's1', priority: 'MEDIUM', type: 'TASK', project: mockProject('PRJ') },
    createdBy: { id: 'user-id', name: 'Test User' },
    ...overrides,
  } as IssueLinkRow;
}

describe('IssueLinksService', () => {
  let service: IssueLinksService;
  let linksRepo: Record<string, jest.Mock>;
  let activitiesService: { recordOne: jest.Mock };

  const sourceIssueId = 'source-issue-id';
  const targetIssueId = 'target-issue-id';
  const userId = 'user-id';

  beforeEach(async () => {
    resetFactoryCounter();

    linksRepo = {
      findActiveProjectRef: jest.fn().mockResolvedValue(null),
      findIssueRefsByIds: jest.fn().mockResolvedValue(new Map()),
      findExisting: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findByIdInIssue: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      findByIssue: jest.fn().mockResolvedValue({ outward: [], inward: [] }),
      findDependsOnReachable: jest.fn().mockResolvedValue([]),
    };

    activitiesService = {
      recordOne: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueLinksService,
        { provide: IssueLinksRepository, useValue: linksRepo },
        { provide: ActivitiesService, useValue: activitiesService },
        BackgroundTasks,
      ],
    }).compile();

    service = module.get<IssueLinksService>(IssueLinksService);
  });

  describe('create', () => {
    const dto = {
      type: 'RELATES_TO' as const,
      targetIssueId,
    };

    it('should create a link successfully', async () => {
      linksRepo.findActiveProjectRef.mockResolvedValue({
        id: targetIssueId,
        projectId: 'proj-1',
        number: 2,
      });
      linksRepo.findExisting.mockResolvedValue(null);
      linksRepo.create.mockResolvedValue(
        mockLinkRow({
          sourceIssueId,
          targetIssueId,
          type: IssueLinkType.RELATES_TO,
        }),
      );

      const result = await service.create(sourceIssueId, dto, userId);

      expect(result.linkedIssue.number).toBe(2);
      expect(linksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: IssueLinkType.RELATES_TO,
          sourceIssueId,
          targetIssueId,
          createdById: userId,
        }),
      );
    });

    it('should reject self-links', async () => {
      await expect(
        service.create(sourceIssueId, { ...dto, targetIssueId: sourceIssueId }, userId),
      ).rejects.toMatchObject({
        code: ErrorCode.LINK_SELF_REFERENCE,
      });
    });

    it('should reject link to non-existent issue', async () => {
      linksRepo.findActiveProjectRef.mockResolvedValue(null);

      await expect(
        service.create(sourceIssueId, dto, userId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject duplicate links', async () => {
      linksRepo.findActiveProjectRef.mockResolvedValue({
        id: targetIssueId, projectId: 'p', number: 2,
      });
      linksRepo.findExisting.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(sourceIssueId, dto, userId),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects a reverse-duplicate of a symmetric link (RELATES_TO)', async () => {
      linksRepo.findActiveProjectRef.mockResolvedValue({
        id: targetIssueId, projectId: 'p', number: 2,
      });
      // Forward (source→target) absent, but the reverse row (target→source) exists.
      linksRepo.findExisting
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'reverse' });

      await expect(
        service.create(sourceIssueId, dto, userId),
      ).rejects.toThrow(ConflictError);
      // The bidirectional check must have looked the other way too.
      expect(linksRepo.findExisting).toHaveBeenCalledTimes(2);
    });

    it('should detect dependency cycles for IS_BLOCKED_BY', async () => {
      const cyclicDto = { type: 'IS_BLOCKED_BY' as const, targetIssueId };

      linksRepo.findActiveProjectRef.mockResolvedValue({
        id: targetIssueId, projectId: 'p', number: 2,
      });
      // Target already depends on source — would create A→B→A cycle.
      // FRONTEND_TO_PRISMA['IS_BLOCKED_BY'] = { type: DEPENDS_ON, flip: false }
      // The reachable set from the target contains sourceIssueId → cycle.
      linksRepo.findDependsOnReachable.mockResolvedValueOnce([sourceIssueId]);

      await expect(
        service.create(sourceIssueId, cyclicDto, userId),
      ).rejects.toMatchObject({
        code: ErrorCode.LINK_CYCLE_DETECTED,
      });
    });
  });

  describe('remove', () => {
    it('should remove an existing link', async () => {
      linksRepo.findByIdInIssue.mockResolvedValue({
        id: 'link-1',
        sourceIssueId,
        targetIssueId,
        type: IssueLinkType.RELATES_TO,
      });

      await service.remove('link-1', sourceIssueId, userId);

      expect(linksRepo.delete).toHaveBeenCalledWith('link-1');
    });

    it('should throw when link not found', async () => {
      linksRepo.findByIdInIssue.mockResolvedValue(null);

      await expect(
        service.remove('non-existent', sourceIssueId, userId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('findByIssue', () => {
    it('should return grouped links as array', async () => {
      const outwardLink = mockLinkRow({
        sourceIssueId,
        targetIssueId,
        type: IssueLinkType.DEPENDS_ON,
      });

      linksRepo.findByIssue.mockResolvedValue({ outward: [outwardLink], inward: [] });

      const result = await service.findByIssue(sourceIssueId);

      const isBlockedByGroup = result.find((g) => g.type === 'IS_BLOCKED_BY');
      expect(isBlockedByGroup).toBeDefined();
      expect(isBlockedByGroup!.links).toHaveLength(1);
      expect(isBlockedByGroup!.links[0].linkedIssue.number).toBe(2);

      expect(result.find((g) => g.type === 'BLOCKS')).toBeUndefined();
    });

    it('should correctly classify inward BLOCKS links as IS_BLOCKED_BY', async () => {
      const inwardLink = mockLinkRow({
        sourceIssueId: 'other-issue',
        targetIssueId: sourceIssueId,
        type: IssueLinkType.BLOCKS,
      });

      linksRepo.findByIssue.mockResolvedValue({ outward: [], inward: [inwardLink] });

      const result = await service.findByIssue(sourceIssueId);

      const isBlockedByGroup = result.find((g) => g.type === 'IS_BLOCKED_BY');
      expect(isBlockedByGroup).toBeDefined();
      expect(isBlockedByGroup!.links[0].direction).toBe('inward');
    });
  });
});
