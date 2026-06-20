import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from '@/common/errors/domain.errors';
import { WorkflowTrigger } from '@prisma/client';
import { WorkflowEngine } from './workflow-engine';
import { ConditionEvaluator } from './condition-evaluator';
import { ActionExecutor } from './action-executor';
import {
  WorkflowRulesRepository,
  RuleExecutionRow,
} from './workflow-rules.repository';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let rulesRepo: {
    findEnabledByTrigger: jest.Mock;
    findRawById: jest.Mock;
    recordExecution: jest.Mock;
  };
  let actionExecutor: ActionExecutor;

  const projectId = 'project-1';

  const makeRule = (
    overrides: Partial<RuleExecutionRow> = {},
  ): RuleExecutionRow => ({
    id: 'rule-1',
    name: 'Test Rule',
    conditions: { field: 'type', op: 'in', values: ['BUG'] },
    actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
    ...overrides,
  });

  const makeContext = () => ({
    issue: {
      type: 'BUG',
      priority: 'MEDIUM',
      statusId: 'st-open',
      statusCategory: 'UNSTARTED',
      assigneeId: null,
      tagIds: [],
    },
  });

  const makeActionContext = () => ({
    issueId: 'issue-1',
    projectId,
    triggeredBy: 'user-1',
  });

  beforeEach(async () => {
    rulesRepo = {
      findEnabledByTrigger: jest.fn().mockResolvedValue([]),
      findRawById: jest.fn().mockResolvedValue(null),
      recordExecution: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        ConditionEvaluator,
        { provide: ActionExecutor, useValue: { execute: jest.fn().mockResolvedValue(undefined) } },
        { provide: WorkflowRulesRepository, useValue: rulesRepo },
      ],
    }).compile();

    engine = module.get<WorkflowEngine>(WorkflowEngine);
    actionExecutor = module.get<ActionExecutor>(ActionExecutor);
  });

  describe('evaluateGuards', () => {
    it('should throw when BLOCK_TRANSITION matches', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([
        makeRule({
          actions: [{ type: 'BLOCK_TRANSITION', message: 'Bugs cannot be closed without assignee' }],
        }),
      ]);

      await expect(
        engine.evaluateGuards(projectId, WorkflowTrigger.ON_CREATE, makeContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should not throw when conditions do not match', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([
        makeRule({
          conditions: { field: 'type', op: 'in', values: ['TASK'] },
          actions: [{ type: 'BLOCK_TRANSITION', message: 'Blocked' }],
        }),
      ]);

      await expect(
        engine.evaluateGuards(projectId, WorkflowTrigger.ON_CREATE, makeContext()),
      ).resolves.toBeUndefined();
    });
  });

  describe('findGuardRules + evaluateGuardsForRules', () => {
    it('fetches rules once and evaluates many contexts in memory', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([makeRule()]);

      const rules = await engine.findGuardRules(
        projectId,
        WorkflowTrigger.ON_STATUS_CHANGE,
      );

      // Two in-memory evaluations, but only one DB fetch.
      engine.evaluateGuardsForRules(rules, makeContext());
      engine.evaluateGuardsForRules(rules, makeContext());

      expect(rulesRepo.findEnabledByTrigger).toHaveBeenCalledTimes(1);
    });

    it('throws when a pre-fetched rule blocks the transition', () => {
      const rules: RuleExecutionRow[] = [
        makeRule({
          actions: [{ type: 'BLOCK_TRANSITION', message: 'blocked' }],
        }),
      ];

      expect(() => engine.evaluateGuardsForRules(rules, makeContext())).toThrow(
        ValidationError,
      );
    });

    it('does not throw when conditions do not match', () => {
      const rules: RuleExecutionRow[] = [
        makeRule({
          conditions: { field: 'type', op: 'in', values: ['TASK'] },
          actions: [{ type: 'BLOCK_TRANSITION', message: 'blocked' }],
        }),
      ];

      expect(() =>
        engine.evaluateGuardsForRules(rules, makeContext()),
      ).not.toThrow();
    });
  });

  describe('executeRules', () => {
    it('should execute matching rule actions', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([makeRule()]);

      await engine.executeRules(
        projectId,
        WorkflowTrigger.ON_CREATE,
        makeContext(),
        makeActionContext(),
      );

      expect(actionExecutor.execute).toHaveBeenCalledWith(
        { type: 'SET_PRIORITY', priority: 'HIGH' },
        makeActionContext(),
      );
      expect(rulesRepo.recordExecution).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('should skip non-matching rules', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([
        makeRule({ conditions: { field: 'type', op: 'in', values: ['FEATURE'] } }),
      ]);

      await engine.executeRules(
        projectId,
        WorkflowTrigger.ON_CREATE,
        makeContext(),
        makeActionContext(),
      );

      expect(actionExecutor.execute).not.toHaveBeenCalled();
    });

    it('should skip BLOCK_TRANSITION actions during execution', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([
        makeRule({
          actions: [
            { type: 'BLOCK_TRANSITION', message: 'guard' },
            { type: 'SET_PRIORITY', priority: 'CRITICAL' },
          ],
        }),
      ]);

      await engine.executeRules(
        projectId,
        WorkflowTrigger.ON_CREATE,
        makeContext(),
        makeActionContext(),
      );

      expect(actionExecutor.execute).toHaveBeenCalledTimes(1);
      expect(actionExecutor.execute).toHaveBeenCalledWith(
        { type: 'SET_PRIORITY', priority: 'CRITICAL' },
        makeActionContext(),
      );
    });

    it('should record failure when action throws', async () => {
      rulesRepo.findEnabledByTrigger.mockResolvedValue([makeRule()]);
      (actionExecutor.execute as jest.Mock).mockRejectedValue(new Error('DB error'));

      await engine.executeRules(
        projectId,
        WorkflowTrigger.ON_CREATE,
        makeContext(),
        makeActionContext(),
      );

      expect(rulesRepo.recordExecution).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'DB error' }),
      );
    });
  });

  describe('dryRun', () => {
    it('should return matches=true with actions when conditions match', async () => {
      rulesRepo.findRawById.mockResolvedValue({
        conditions: { field: 'type', op: 'in', values: ['BUG'] },
        actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
      });

      const result = await engine.dryRun('rule-1', makeContext());

      expect(result.matches).toBe(true);
      expect(result.actions).toEqual([{ type: 'SET_PRIORITY', priority: 'HIGH' }]);
    });

    it('should return matches=false when conditions do not match', async () => {
      rulesRepo.findRawById.mockResolvedValue({
        conditions: { field: 'type', op: 'in', values: ['FEATURE'] },
        actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
      });

      const result = await engine.dryRun('rule-1', makeContext());

      expect(result.matches).toBe(false);
      expect(result.actions).toEqual([]);
    });

    it('should return matches=false when rule not found', async () => {
      rulesRepo.findRawById.mockResolvedValue(null);

      const result = await engine.dryRun('bad', makeContext());

      expect(result.matches).toBe(false);
    });
  });
});
