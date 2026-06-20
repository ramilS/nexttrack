import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  AssignStrategy as PrismaAssignStrategy,
  StatusCategory,
} from '@prisma/client';
import type {
  AutoAssignConditions,
  AutoAssignPreview,
  AutoAssignRule,
  CreateAutoAssignRuleParsed,
  PreviewAutoAssignInput,
  UpdateAutoAssignRuleInput,
} from '@repo/shared/schemas';
import {
  AutoAssignRepository,
  AutoAssignRuleRow,
  AutoAssignRuleForMatch,
} from './auto-assign.repository';

function getConditions(rule: { conditions: unknown }): AutoAssignConditions {
  return (rule.conditions ?? {}) as AutoAssignConditions;
}

function toAutoAssignRule(rule: AutoAssignRuleRow): AutoAssignRule {
  return {
    id: rule.id,
    name: rule.name,
    isEnabled: rule.isEnabled,
    priority: rule.priority,
    conditions: getConditions(rule),
    strategy: rule.strategy,
    assigneeId: rule.assigneeId,
    teamId: rule.teamId,
    assignee: rule.assignee,
    team: rule.team,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

@Injectable()
export class AutoAssignService {
  private readonly logger = new AppLogger(AutoAssignService.name);

  constructor(private repo: AutoAssignRepository) {}

  async findAll(projectId: string): Promise<AutoAssignRule[]> {
    const rules = await this.repo.findAllForProject(projectId);
    return rules.map(toAutoAssignRule);
  }

  async create(
    projectId: string,
    dto: CreateAutoAssignRuleParsed,
  ): Promise<AutoAssignRule> {
    const rule = await this.repo.create({
      projectId,
      name: dto.name,
      isEnabled: dto.isEnabled,
      priority: dto.priority,
      conditions: dto.conditions,
      strategy: dto.strategy,
      assigneeId: dto.assigneeId ?? null,
      teamId: dto.teamId ?? null,
    });

    this.logger.log('Auto-assign rule created', {
      ruleId: rule.id,
      projectId,
      strategy: dto.strategy,
      assigneeId: dto.assigneeId ?? null,
      teamId: dto.teamId ?? null,
    });

    return toAutoAssignRule(rule);
  }

  async update(
    projectId: string,
    ruleId: string,
    dto: UpdateAutoAssignRuleInput,
  ): Promise<AutoAssignRule> {
    await this.assertRuleExists(projectId, ruleId);

    this.logger.log('Updating auto-assign rule', {
      ruleId,
      projectId,
      fields: Object.keys(dto),
      isEnabled: dto.isEnabled,
    });

    const rule = await this.repo.update(ruleId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.conditions !== undefined && {
        conditions: dto.conditions,
      }),
      ...(dto.strategy !== undefined && { strategy: dto.strategy }),
      ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      ...(dto.teamId !== undefined && { teamId: dto.teamId }),
    });
    return toAutoAssignRule(rule);
  }

  async remove(projectId: string, ruleId: string): Promise<void> {
    await this.assertRuleExists(projectId, ruleId);
    await this.repo.delete(ruleId);

    this.logger.log('Auto-assign rule deleted', { ruleId, projectId });
  }

  async evaluate(
    projectId: string,
    issueData: PreviewAutoAssignInput,
  ): Promise<string | null> {
    const match = await this.findMatchingRule(projectId, issueData);

    if (match) {
      this.logger.log('Auto-assign matched', {
        projectId,
        ruleId: match.rule.id,
        assigneeId: match.assigneeId,
      });
    } else {
      this.logger.debug('Auto-assign no rule matched', { projectId });
    }

    return match?.assigneeId ?? null;
  }

  async preview(
    projectId: string,
    issueData: PreviewAutoAssignInput,
  ): Promise<AutoAssignPreview> {
    const match = await this.findMatchingRule(projectId, issueData);

    if (!match) {
      return { matched: false, assignee: null, rule: null };
    }

    const assignee = match.assigneeId
      ? await this.repo.findUserPublicRefById(match.assigneeId)
      : null;

    return {
      matched: true,
      assignee,
      rule: { id: match.rule.id, name: match.rule.name },
    };
  }

  // ─── Private helpers ───────────────────────────────────────

  private async findMatchingRule(
    projectId: string,
    issueData: PreviewAutoAssignInput,
  ): Promise<
    { rule: AutoAssignRuleForMatch; assigneeId: string | null } | null
  > {
    const rules = await this.repo.findEnabledForProject(projectId);

    for (const rule of rules) {
      if (!this.matchConditions(getConditions(rule), issueData)) continue;

      const assigneeId = await this.resolveAssignee(rule, projectId);
      if (assigneeId) return { rule, assigneeId };
    }

    return null;
  }

  private matchConditions(
    conditions: AutoAssignConditions,
    issueData: PreviewAutoAssignInput,
  ): boolean {
    if (conditions.issueType?.length) {
      if (!conditions.issueType.includes(issueData.type)) return false;
    }

    if (conditions.priority?.length) {
      if (!conditions.priority.includes(issueData.priority)) return false;
    }

    if (conditions.tagIds?.length && issueData.tagIds?.length) {
      const hasMatchingTag = conditions.tagIds.some((t) =>
        issueData.tagIds!.includes(t),
      );
      if (!hasMatchingTag) return false;
    }

    return true;
  }

  private async resolveAssignee(
    rule: {
      strategy: PrismaAssignStrategy;
      assigneeId: string | null;
      teamId: string | null;
    },
    projectId: string,
  ): Promise<string | null> {
    switch (rule.strategy) {
      case PrismaAssignStrategy.SPECIFIC_USER:
        return rule.assigneeId;

      case PrismaAssignStrategy.PROJECT_LEAD:
        return this.repo.findProjectLeadUserId(projectId);

      case PrismaAssignStrategy.ROUND_ROBIN_TEAM:
        return this.leastLoadedTeamMember(rule.teamId, projectId, null);

      case PrismaAssignStrategy.LEAST_LOADED_TEAM:
        return this.leastLoadedTeamMember(rule.teamId, projectId, 'openOnly');

      default:
        return null;
    }
  }

  private async leastLoadedTeamMember(
    teamId: string | null,
    projectId: string,
    mode: 'openOnly' | null,
  ): Promise<string | null> {
    if (!teamId) return null;

    const memberIds = await this.repo.findTeamMemberUserIds(teamId);
    if (memberIds.length === 0) return null;

    let activeStatusIds: string[] | undefined;
    if (mode === 'openOnly') {
      const workflow = await this.repo.findDefaultWorkflowStatuses(projectId);
      if (workflow) {
        activeStatusIds = workflow.statuses
          .filter(
            (s) =>
              s.category === StatusCategory.UNSTARTED ||
              s.category === StatusCategory.STARTED,
          )
          .map((s) => s.id);
      } else {
        // No default workflow → fall back to the first team member.
        return memberIds[0];
      }
    }

    const counts = await this.repo.countOpenAssignments(
      projectId,
      memberIds,
      activeStatusIds,
    );

    let minCount = Infinity;
    let selectedUserId = memberIds[0];
    for (const userId of memberIds) {
      const count = counts.get(userId) ?? 0;
      if (count < minCount) {
        minCount = count;
        selectedUserId = userId;
      }
    }
    return selectedUserId;
  }

  private async assertRuleExists(projectId: string, ruleId: string) {
    const rule = await this.repo.findById(projectId, ruleId);

    if (!rule) {
      throw new NotFoundError(ErrorCode.AUTO_ASSIGN_RULE_NOT_FOUND, 'Auto-assign rule not found');
    }

    return rule;
  }
}
