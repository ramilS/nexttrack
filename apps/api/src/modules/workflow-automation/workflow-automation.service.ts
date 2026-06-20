import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
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
  private readonly logger = new AppLogger(WorkflowAutomationService.name);

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
    const rule = await this.rulesRepo.create({
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

    this.logger.log('Workflow rule created', {
      ruleId: rule.id,
      projectId,
      workflowId: dto.workflowId,
      trigger: dto.trigger,
      actionCount: dto.actions.length,
    });

    return rule;
  }

  async update(
    projectId: string,
    ruleId: string,
    dto: UpdateWorkflowRuleInput,
  ): Promise<WorkflowRule> {
    await this.assertRuleExists(projectId, ruleId);

    this.logger.log('Updating workflow rule', {
      ruleId,
      projectId,
      fields: Object.keys(dto),
      isEnabled: dto.isEnabled,
    });

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

    this.logger.log('Workflow rule deleted', { ruleId, projectId });
  }

  async toggle(projectId: string, ruleId: string): Promise<WorkflowRule> {
    const current = await this.rulesRepo.getEnabledFlag(projectId, ruleId);
    if (current === null) throw this.notFound();

    this.logger.log('Workflow rule toggled', {
      ruleId,
      projectId,
      isEnabled: !current,
    });

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
