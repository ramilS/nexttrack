import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowTrigger } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import {
  workflowActionSchema,
  workflowConditionSchema,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowRule,
  type WorkflowRuleExecution,
} from '@repo/shared/schemas';
import type { PaginationMeta } from '@repo/shared/schemas';

interface UserSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

const RULE_INCLUDE = {
  workflow: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { executions: true } },
} as const;

type RuleRow = Prisma.WorkflowRuleGetPayload<{ include: typeof RULE_INCLUDE }>;

function parseStoredCondition(value: unknown): WorkflowCondition {
  const result = workflowConditionSchema.safeParse(value);
  return result.success ? result.data : { and: [] };
}

function parseStoredActions(value: unknown): WorkflowAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a) => {
    const parsed = workflowActionSchema.safeParse(a);
    return parsed.success ? [parsed.data] : [];
  });
}

function toWorkflowRule(row: RuleRow): WorkflowRule {
  return {
    id: row.id,
    projectId: row.projectId,
    workflowId: row.workflowId,
    workflow: row.workflow,
    name: row.name,
    description: row.description,
    isEnabled: row.isEnabled,
    trigger: row.trigger,
    conditions: parseStoredCondition(row.conditions),
    actions: parseStoredActions(row.actions),
    priority: row.priority,
    createdBy: row.createdBy as UserSummary,
    executionCount: row._count?.executions ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExecution(row: {
  id: string;
  ruleId: string;
  issueId: string;
  triggeredBy: string;
  success: boolean;
  error: string | null;
  duration: number;
  createdAt: Date;
}): WorkflowRuleExecution {
  return {
    id: row.id,
    ruleId: row.ruleId,
    issueId: row.issueId,
    triggeredBy: row.triggeredBy,
    success: row.success,
    error: row.error,
    duration: row.duration,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface WorkflowRuleCreateInput {
  projectId: string;
  workflowId: string;
  name: string;
  description: string | null;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition;
  actions: WorkflowAction[];
  priority: number;
  createdById: string;
}

export interface WorkflowRulePatch {
  name?: string;
  description?: string | null;
  trigger?: WorkflowTrigger;
  conditions?: WorkflowCondition;
  actions?: WorkflowAction[];
  priority?: number;
  isEnabled?: boolean;
}

/**
 * Lean runtime shape used by the workflow engine. Carries only what the
 * engine needs to evaluate conditions and execute actions — no joined user
 * or workflow metadata.
 */
export interface RuleExecutionRow {
  id: string;
  name: string;
  conditions: unknown;
  actions: WorkflowAction[];
}

export interface ExecutionRecord {
  ruleId: string;
  issueId: string;
  triggeredBy: string;
  success: boolean;
  error: string | null;
  duration: number;
}

/**
 * Data access for `WorkflowRule` and `WorkflowRuleExecution`. The engine
 * itself depends only on this repo plus the typed action/condition shapes
 * from `@repo/shared/schemas` — no Prisma types leak into the engine.
 */
@Injectable()
export class WorkflowRulesRepository {
  constructor(private prisma: PrismaService) {}

  async findAllByProject(projectId: string): Promise<WorkflowRule[]> {
    const rows = await this.prisma.workflowRule.findMany({
      where: { projectId },
      include: RULE_INCLUDE,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toWorkflowRule);
  }

  async findOneInProject(
    projectId: string,
    ruleId: string,
  ): Promise<WorkflowRule | null> {
    const row = await this.prisma.workflowRule.findFirst({
      where: { id: ruleId, projectId },
      include: RULE_INCLUDE,
    });
    return row ? toWorkflowRule(row) : null;
  }

  async existsInProject(projectId: string, ruleId: string): Promise<boolean> {
    const row = await this.prisma.workflowRule.findFirst({
      where: { id: ruleId, projectId },
      select: { id: true },
    });
    return row !== null;
  }

  async getEnabledFlag(
    projectId: string,
    ruleId: string,
  ): Promise<boolean | null> {
    const row = await this.prisma.workflowRule.findFirst({
      where: { id: ruleId, projectId },
      select: { isEnabled: true },
    });
    return row?.isEnabled ?? null;
  }

  /** Enabled rules for a project + trigger, in execution order. */
  async findEnabledByTrigger(
    projectId: string,
    trigger: WorkflowTrigger,
  ): Promise<RuleExecutionRow[]> {
    const rows = await this.prisma.workflowRule.findMany({
      where: { projectId, isEnabled: true, trigger },
      orderBy: { priority: 'asc' },
      select: { id: true, name: true, conditions: true, actions: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      conditions: r.conditions,
      actions: parseStoredActions(r.actions),
    }));
  }

  /** Raw rule lookup for dry-run; no joins. */
  async findRawById(ruleId: string): Promise<{
    conditions: unknown;
    actions: WorkflowAction[];
  } | null> {
    const row = await this.prisma.workflowRule.findUnique({
      where: { id: ruleId },
      select: { conditions: true, actions: true },
    });
    if (!row) return null;
    return {
      conditions: row.conditions,
      actions: parseStoredActions(row.actions),
    };
  }

  async create(input: WorkflowRuleCreateInput): Promise<WorkflowRule> {
    const row = await this.prisma.workflowRule.create({
      data: {
        projectId: input.projectId,
        workflowId: input.workflowId,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        conditions: asJson(input.conditions),
        actions: asJson(input.actions),
        priority: input.priority,
        createdById: input.createdById,
      },
      include: RULE_INCLUDE,
    });
    return toWorkflowRule(row);
  }

  async update(ruleId: string, patch: WorkflowRulePatch): Promise<WorkflowRule> {
    const data: Prisma.WorkflowRuleUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.trigger !== undefined) data.trigger = patch.trigger;
    if (patch.conditions !== undefined) data.conditions = asJson(patch.conditions);
    if (patch.actions !== undefined) data.actions = asJson(patch.actions);
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.isEnabled !== undefined) data.isEnabled = patch.isEnabled;

    const row = await this.prisma.workflowRule.update({
      where: { id: ruleId },
      data,
      include: RULE_INCLUDE,
    });
    return toWorkflowRule(row);
  }

  async delete(ruleId: string): Promise<void> {
    await this.prisma.workflowRule.delete({ where: { id: ruleId } });
  }

  // ─── Executions ─────────────────────────────────────────────

  async findExecutionsPage(
    ruleId: string,
    page: number,
    perPage: number,
  ): Promise<{ items: WorkflowRuleExecution[]; meta: PaginationMeta }> {
    const where = { ruleId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workflowRuleExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.workflowRuleExecution.count({ where }),
    ]);

    return {
      items: rows.map(toExecution),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  async recordExecution(record: ExecutionRecord): Promise<void> {
    await this.prisma.workflowRuleExecution.create({
      data: record,
    });
  }
}
