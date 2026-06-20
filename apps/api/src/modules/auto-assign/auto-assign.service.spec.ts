import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AssignStrategy, type AutoAssignRule } from '@prisma/client';
import type { PreviewAutoAssignInput } from '@repo/shared/schemas';
import { AutoAssignService } from './auto-assign.service';
import { AutoAssignRepository } from './auto-assign.repository';

const baseRule = (overrides: Partial<AutoAssignRule> = {}) => ({
  id: 'rule-1',
  projectId: 'proj-1',
  name: 'Rule 1',
  isEnabled: true,
  priority: 1,
  conditions: {},
  strategy: AssignStrategy.SPECIFIC_USER,
  assigneeId: 'user-1',
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const baseRuleRow = (overrides: Partial<AutoAssignRule> = {}) => ({
  ...baseRule(overrides),
  assignee: {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
  },
  team: null,
});

describe('AutoAssignService', () => {
  let service: AutoAssignService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findAllForProject: jest.fn().mockResolvedValue([]),
      findEnabledForProject: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      findUserPublicRefById: jest.fn().mockResolvedValue(null),
      findProjectLeadUserId: jest.fn().mockResolvedValue(null),
      findTeamMemberUserIds: jest.fn().mockResolvedValue([]),
      findDefaultWorkflowStatuses: jest.fn().mockResolvedValue(null),
      countOpenAssignments: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoAssignService,
        { provide: AutoAssignRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(AutoAssignService);
  });

  describe('findAll', () => {
    it('returns mapped rules', async () => {
      repo.findAllForProject.mockResolvedValue([baseRuleRow()]);

      const result = await service.findAll('proj-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rule-1');
      expect(result[0].assignee?.name).toBe('Alice');
    });
  });

  describe('update / remove', () => {
    it('throws NotFound when rule missing', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update('proj-1', 'r1', { name: 'X' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('deletes existing rule', async () => {
      repo.findById.mockResolvedValue(baseRule());

      await service.remove('proj-1', 'rule-1');

      expect(repo.delete).toHaveBeenCalledWith('rule-1');
    });
  });

  describe('evaluate / preview', () => {
    it('returns null when no enabled rules match', async () => {
      repo.findEnabledForProject.mockResolvedValue([]);

      const result = await service.evaluate('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBeNull();
    });

    it('SPECIFIC_USER returns assigneeId', async () => {
      repo.findEnabledForProject.mockResolvedValue([baseRule()]);

      const result = await service.evaluate('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBe('user-1');
    });

    it('filters out rules that do not match issueType condition', async () => {
      repo.findEnabledForProject.mockResolvedValue([
        baseRule({ conditions: { issueType: ['BUG'] } }),
      ]);

      const result = await service.evaluate('proj-1', {
        type: 'FEATURE',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBeNull();
    });

    it('PROJECT_LEAD strategy delegates to repo', async () => {
      repo.findEnabledForProject.mockResolvedValue([
        baseRule({ strategy: AssignStrategy.PROJECT_LEAD, assigneeId: null }),
      ]);
      repo.findProjectLeadUserId.mockResolvedValue('lead-user');

      const result = await service.evaluate('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBe('lead-user');
    });

    it('ROUND_ROBIN_TEAM picks lowest-loaded member', async () => {
      repo.findEnabledForProject.mockResolvedValue([
        baseRule({
          strategy: AssignStrategy.ROUND_ROBIN_TEAM,
          teamId: 'team-1',
          assigneeId: null,
        }),
      ]);
      repo.findTeamMemberUserIds.mockResolvedValue(['u1', 'u2', 'u3']);
      repo.countOpenAssignments.mockResolvedValue(
        new Map([
          ['u1', 5],
          ['u2', 2],
          ['u3', 3],
        ]),
      );

      const result = await service.evaluate('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBe('u2');
    });

    it('LEAST_LOADED_TEAM falls back to first member when no workflow', async () => {
      repo.findEnabledForProject.mockResolvedValue([
        baseRule({
          strategy: AssignStrategy.LEAST_LOADED_TEAM,
          teamId: 'team-1',
          assigneeId: null,
        }),
      ]);
      repo.findTeamMemberUserIds.mockResolvedValue(['u1', 'u2']);
      repo.findDefaultWorkflowStatuses.mockResolvedValue(null);

      const result = await service.evaluate('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toBe('u1');
    });

    it('preview returns matched assignee', async () => {
      repo.findEnabledForProject.mockResolvedValue([baseRule()]);
      repo.findUserPublicRefById.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatarUrl: null,
      });

      const result = await service.preview('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result.matched).toBe(true);
      expect(result.assignee?.id).toBe('user-1');
      expect(result.rule?.id).toBe('rule-1');
    });

    it('preview returns matched:false when no rule matches', async () => {
      repo.findEnabledForProject.mockResolvedValue([]);

      const result = await service.preview('proj-1', {
        type: 'BUG',
        priority: 'HIGH',
        tagIds: [],
      } satisfies PreviewAutoAssignInput);

      expect(result).toEqual({ matched: false, assignee: null, rule: null });
    });
  });
});
