import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@repo/shared/error-codes';
import { NotFoundError } from '@/common/errors/domain.errors';
import type {
  CreateWorkflowRuleParsed,
  UpdateWorkflowRuleInput,
  WorkflowRule,
  WorkflowRuleExecution,
  PaginationMeta,
} from '@repo/shared/schemas';
import { WorkflowRulesRepository } from './workflow-rules.repository';

@Injectable()
export class WorkflowAutomationService {
  constructor(private rulesRepo: WorkflowRulesRepository) {}

  async findAll(projectId: string): Promise<WorkflowRule[]> {
    return this.rulesRepo.findAllByProject(projectId);
  }

  async findOne(projectId: string, ruleId: string): Promise<WorkflowRule> {
    const rule = await this.rulesRepo.findOneInProject(projectId, ruleId);
    if (!rule) throw this.notFound();
    return rule;
  }

  async create(
    projectId: string,
    dto: CreateWorkflowRuleParsed,
    userId: string,
  ): Promise<WorkflowRule> {
    return this.rulesRepo.create({
      projectId,
      workflowId: dto.workflowId,
      name: dto.name,
      description: dto.description ?? null,
      trigger: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      priority: dto.priority,
      createdById: userId,
    });
  }

  async update(
    projectId: string,
    ruleId: string,
    dto: UpdateWorkflowRuleInput,
  ): Promise<WorkflowRule> {
    await this.assertRuleExists(projectId, ruleId);
    return this.rulesRepo.update(ruleId, {
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      priority: dto.priority,
      isEnabled: dto.isEnabled,
    });
  }

  async remove(projectId: string, ruleId: string): Promise<void> {
    await this.assertRuleExists(projectId, ruleId);
    await this.rulesRepo.delete(ruleId);
  }

  async toggle(projectId: string, ruleId: string): Promise<WorkflowRule> {
    const current = await this.rulesRepo.getEnabledFlag(projectId, ruleId);
    if (current === null) throw this.notFound();
    return this.rulesRepo.update(ruleId, { isEnabled: !current });
  }

  async getExecutions(
    projectId: string,
    ruleId: string,
    page: number,
    perPage: number,
  ): Promise<{ items: WorkflowRuleExecution[]; meta: PaginationMeta }> {
    await this.assertRuleExists(projectId, ruleId);
    return this.rulesRepo.findExecutionsPage(ruleId, page, perPage);
  }

  private async assertRuleExists(projectId: string, ruleId: string) {
    const exists = await this.rulesRepo.existsInProject(projectId, ruleId);
    if (!exists) throw this.notFound();
  }

  private notFound(): NotFoundError {
    return new NotFoundError(
      ErrorCode.WORKFLOW_RULE_NOT_FOUND,
      'Workflow rule not found',
    );
  }
}
