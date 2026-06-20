import { Injectable } from '@nestjs/common';
import {
  AssignStrategy,
  Prisma,
  type AutoAssignRule as PrismaAutoAssignRule,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { AutoAssignConditions, WorkflowStatus } from '@repo/shared/schemas';

const ruleInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  team: { select: { id: true, name: true } },
} as const;

export type AutoAssignRuleRow = Prisma.AutoAssignRuleGetPayload<{
  include: typeof ruleInclude;
}>;

export interface AutoAssignRuleCreateInput {
  projectId: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  conditions: AutoAssignConditions;
  strategy: AssignStrategy;
  assigneeId: string | null;
  teamId: string | null;
}

export interface AutoAssignRulePatch {
  name?: string;
  isEnabled?: boolean;
  priority?: number;
  conditions?: AutoAssignConditions;
  strategy?: AssignStrategy;
  assigneeId?: string | null;
  teamId?: string | null;
}

// Raw rule fields the auto-assign matcher needs (no relations). Keeps the
// Prisma model type out of the service.
export type AutoAssignRuleForMatch = Pick<
  PrismaAutoAssignRule,
  'id' | 'name' | 'conditions' | 'strategy' | 'assigneeId' | 'teamId'
>;

export interface AssigneePublicRef {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

@Injectable()
export class AutoAssignRepository {
  constructor(private prisma: PrismaService) {}

  async findAllForProject(projectId: string): Promise<AutoAssignRuleRow[]> {
    return this.prisma.autoAssignRule.findMany({
      where: { projectId },
      orderBy: { priority: 'asc' },
      include: ruleInclude,
    });
  }

  async findEnabledForProject(
    projectId: string,
  ): Promise<AutoAssignRuleForMatch[]> {
    return this.prisma.autoAssignRule.findMany({
      where: { projectId, isEnabled: true },
      orderBy: { priority: 'asc' },
    });
  }

  async findById(
    projectId: string,
    ruleId: string,
  ): Promise<PrismaAutoAssignRule | null> {
    return this.prisma.autoAssignRule.findFirst({
      where: { id: ruleId, projectId },
    });
  }

  async create(input: AutoAssignRuleCreateInput): Promise<AutoAssignRuleRow> {
    const { conditions, ...rest } = input;
    return this.prisma.autoAssignRule.create({
      data: { ...rest, conditions: asJson(conditions) },
      include: ruleInclude,
    });
  }

  async update(
    ruleId: string,
    patch: AutoAssignRulePatch,
  ): Promise<AutoAssignRuleRow> {
    const { conditions, ...rest } = patch;
    return this.prisma.autoAssignRule.update({
      where: { id: ruleId },
      data: {
        ...rest,
        ...(conditions !== undefined ? { conditions: asJson(conditions) } : {}),
      },
      include: ruleInclude,
    });
  }

  async delete(ruleId: string): Promise<void> {
    await this.prisma.autoAssignRule.delete({ where: { id: ruleId } });
  }

  // ─── Strategy support reads ─────────────────────────────────

  async findUserPublicRefById(
    userId: string,
  ): Promise<AssigneePublicRef | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  }

  async findProjectLeadUserId(projectId: string): Promise<string | null> {
    const row = await this.prisma.projectMember.findFirst({
      where: { projectId, roleId: '00000000-0000-0000-0000-000000000001' },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async findTeamMemberUserIds(teamId: string): Promise<string[]> {
    const rows = await this.prisma.teamMember.findMany({
      where: { teamId },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async findDefaultWorkflowStatuses(
    projectId: string,
  ): Promise<{ statuses: WorkflowStatus[] } | null> {
    return this.prisma.workflow.findFirst({
      where: { projectId, isDefault: true },
      select: { statuses: { orderBy: { ordinal: 'asc' } } },
    });
  }

  async countOpenAssignments(
    projectId: string,
    userIds: string[],
    activeStatusIds: string[] | undefined,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.issue.groupBy({
      by: ['assigneeId'],
      where: {
        projectId,
        assigneeId: { in: userIds },
        deletedAt: null,
        ...(activeStatusIds && { statusId: { in: activeStatusIds } }),
      },
      _count: true,
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.assigneeId) map.set(r.assigneeId, r._count);
    }
    return map;
  }
}
