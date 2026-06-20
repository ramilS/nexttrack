import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import { WorkflowTrigger } from '@prisma/client';
import { WorkflowAutomationService } from './workflow-automation.service';
import { WorkflowRulesRepository } from './workflow-rules.repository';
import type { WorkflowRule } from '@repo/shared/schemas';

describe('WorkflowAutomationService', () => {
  let service: WorkflowAutomationService;
  let rulesRepo: {
    findAllByProject: jest.Mock;
    findOneInProject: jest.Mock;
    existsInProject: jest.Mock;
    getEnabledFlag: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findExecutionsPage: jest.Mock;
  };

  const projectId = 'project-1';
  const userId = 'user-1';

  const mockRule: WorkflowRule = {
    id: 'rule-1',
    projectId,
    workflowId: 'wf-1',
    workflow: { id: 'wf-1', name: 'Default' },
    name: 'Auto-close duplicates',
    description: null,
    isEnabled: true,
    trigger: WorkflowTrigger.ON_STATUS_CHANGE,
    conditions: { and: [] },
    actions: [{ type: 'SET_STATUS', statusId: 'st-done' }],
    priority: 0,
    createdBy: { id: userId, name: 'Test', email: 'test@test.local', avatarUrl: null },
    executionCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    rulesRepo = {
      findAllByProject: jest.fn().mockResolvedValue([]),
      findOneInProject: jest.fn().mockResolvedValue(null),
      existsInProject: jest.fn().mockResolvedValue(false),
      getEnabledFlag: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      findExecutionsPage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowAutomationService,
        { provide: WorkflowRulesRepository, useValue: rulesRepo },
      ],
    }).compile();

    service = module.get<WorkflowAutomationService>(WorkflowAutomationService);
  });

  describe('findAll', () => {
    it('should list rules for project', async () => {
      rulesRepo.findAllByProject.mockResolvedValue([mockRule]);
      const result = await service.findAll(projectId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Auto-close duplicates');
    });
  });

  describe('findOne', () => {
    it('should return a rule', async () => {
      rulesRepo.findOneInProject.mockResolvedValue(mockRule);
      const result = await service.findOne(projectId, 'rule-1');
      expect(result.id).toBe('rule-1');
    });

    it('should throw when not found', async () => {
      rulesRepo.findOneInProject.mockResolvedValue(null);
      await expect(service.findOne(projectId, 'bad')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create a rule', async () => {
      rulesRepo.create.mockResolvedValue(mockRule);
      const result = await service.create(projectId, {
        workflowId: 'wf-1',
        name: 'Auto-close duplicates',
        trigger: WorkflowTrigger.ON_STATUS_CHANGE,
        conditions: { and: [] },
        actions: [{ type: 'SET_STATUS', statusId: 'st-done' }],
        priority: 0,
      }, userId);
      expect(result.name).toBe('Auto-close duplicates');
      expect(rulesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, workflowId: 'wf-1', createdById: userId }),
      );
    });
  });

  describe('update', () => {
    it('should update a rule', async () => {
      rulesRepo.existsInProject.mockResolvedValue(true);
      rulesRepo.update.mockResolvedValue({ ...mockRule, name: 'Updated' });

      const result = await service.update(projectId, 'rule-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw when rule not found', async () => {
      rulesRepo.existsInProject.mockResolvedValue(false);
      await expect(service.update(projectId, 'bad', { name: 'X' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('remove', () => {
    it('should delete a rule', async () => {
      rulesRepo.existsInProject.mockResolvedValue(true);
      await service.remove(projectId, 'rule-1');
      expect(rulesRepo.delete).toHaveBeenCalledWith('rule-1');
    });
  });

  describe('toggle', () => {
    it('should toggle isEnabled', async () => {
      rulesRepo.getEnabledFlag.mockResolvedValue(true);
      rulesRepo.update.mockResolvedValue({ ...mockRule, isEnabled: false });

      const result = await service.toggle(projectId, 'rule-1');
      expect(result.isEnabled).toBe(false);
      expect(rulesRepo.update).toHaveBeenCalledWith('rule-1', { isEnabled: false });
    });

    it('should throw when rule not found', async () => {
      rulesRepo.getEnabledFlag.mockResolvedValue(null);
      await expect(service.toggle(projectId, 'bad')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getExecutions', () => {
    it('should return paginated executions', async () => {
      const now = new Date();
      rulesRepo.existsInProject.mockResolvedValue(true);
      rulesRepo.findExecutionsPage.mockResolvedValue({
        items: [
          {
            id: 'exec-1',
            ruleId: 'rule-1',
            issueId: 'issue-1',
            triggeredBy: 'user-1',
            success: true,
            error: null,
            duration: 42,
            createdAt: now.toISOString(),
          },
        ],
        meta: { total: 1, page: 1, perPage: 20, totalPages: 1 },
      });

      const result = await service.getExecutions(projectId, 'rule-1', 1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].createdAt).toBe(now.toISOString());
      expect(result.meta.total).toBe(1);
    });
  });
});
