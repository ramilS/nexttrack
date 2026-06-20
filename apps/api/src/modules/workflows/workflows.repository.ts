import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
} from '@repo/shared/schemas';

const WORKFLOW_INCLUDE = {
  statuses: { orderBy: { ordinal: 'asc' } },
  transitions: true,
} as const;

type StatusRow = {
  id: string;
  name: string;
  color: string;
  category: WorkflowStatus['category'];
  isInitial: boolean;
  isResolved: boolean;
  ordinal: number;
};

type TransitionRow = {
  id: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  requiredRole: WorkflowTransition['requiredRole'];
};

type WorkflowWithRelations = {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  statuses: StatusRow[];
  transitions: TransitionRow[];
  createdAt: Date;
  updatedAt: Date;
};

function toStatus(s: StatusRow): WorkflowStatus {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
    isInitial: s.isInitial,
    isResolved: s.isResolved,
    ordinal: s.ordinal,
  };
}

export function toWorkflow(row: WorkflowWithRelations): Workflow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isDefault: row.isDefault,
    statuses: row.statuses.map(toStatus),
    transitions: row.transitions.map((t) => ({
      id: t.id,
      name: t.name,
      fromStatusId: t.fromStatusId ?? '*',
      toStatusId: t.toStatusId,
      requiredRole: t.requiredRole,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface WorkflowCreateInput {
  projectId: string;
  name: string;
  isDefault: boolean;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

export interface WorkflowUpdateInput {
  name?: string;
  statuses?: WorkflowStatus[];
  transitions?: WorkflowTransition[];
}

function toStatusFields(s: WorkflowStatus) {
  return {
    name: s.name,
    color: s.color,
    category: s.category,
    isInitial: s.isInitial,
    isResolved: s.isResolved,
    ordinal: s.ordinal,
  };
}

function toTransitionCreate(workflowId: string, t: WorkflowTransition) {
  return {
    id: t.id,
    workflowId,
    name: t.name,
    fromStatusId: t.fromStatusId === '*' ? null : t.fromStatusId,
    toStatusId: t.toStatusId,
    requiredRole: t.requiredRole,
  };
}

@Injectable()
export class WorkflowsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findAllByProject(projectId: string): Promise<Workflow[]> {
    const rows = await this.prisma.workflow.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: WORKFLOW_INCLUDE,
    });
    return rows.map(toWorkflow);
  }

  async findById(workflowId: string, projectId: string): Promise<Workflow | null> {
    const row = await this.prisma.workflow.findFirst({
      where: { id: workflowId, projectId },
      include: WORKFLOW_INCLUDE,
    });
    return row ? toWorkflow(row) : null;
  }

  async findDefault(projectId: string): Promise<Workflow | null> {
    const row = await this.prisma.workflow.findFirst({
      where: { projectId, isDefault: true },
      include: WORKFLOW_INCLUDE,
    });
    return row ? toWorkflow(row) : null;
  }

  async findDefaultStatusesByProjects(
    projectIds: string[],
  ): Promise<Map<string, WorkflowStatus[]>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.workflow.findMany({
      where: { projectId: { in: projectIds }, isDefault: true },
      select: { projectId: true, statuses: { orderBy: { ordinal: 'asc' } } },
    });
    return new Map(rows.map((r) => [r.projectId, r.statuses.map(toStatus)]));
  }

  async findDefaultStatuses(projectId: string): Promise<WorkflowStatus[]> {
    const row = await this.prisma.workflow.findFirst({
      where: { projectId, isDefault: true },
      select: { statuses: { orderBy: { ordinal: 'asc' } } },
    });
    return row ? row.statuses.map(toStatus) : [];
  }

  async create(input: WorkflowCreateInput): Promise<Workflow> {
    return this.prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          isDefault: input.isDefault,
          statuses: {
            create: input.statuses.map((s) => ({ id: s.id, ...toStatusFields(s) })),
          },
        },
      });
      if (input.transitions.length > 0) {
        await tx.workflowTransition.createMany({
          data: input.transitions.map((t) => toTransitionCreate(wf.id, t)),
        });
      }
      const full = await tx.workflow.findUniqueOrThrow({
        where: { id: wf.id },
        include: WORKFLOW_INCLUDE,
      });
      return toWorkflow(full);
    });
  }

  async update(
    workflowId: string,
    patch: WorkflowUpdateInput,
    tx?: Tx,
  ): Promise<Workflow> {
    const db = this.db(tx);

    if (patch.statuses !== undefined) {
      const keepIds = patch.statuses.map((s) => s.id);
      // Removed statuses: the service has already remapped issues off them, so
      // the Issue.status RESTRICT FK is satisfied. Their transitions
      // cascade-delete (transition→status onDelete: Cascade).
      await db.workflowStatus.deleteMany({
        where: { workflowId, id: { notIn: keepIds } },
      });
      for (const s of patch.statuses) {
        await db.workflowStatus.upsert({
          where: { id: s.id },
          create: { id: s.id, workflowId, ...toStatusFields(s) },
          update: toStatusFields(s),
        });
      }
    }

    if (patch.transitions !== undefined) {
      // Transitions are replaced wholesale; handled independently of statuses
      // so a status-only patch never silently drops them.
      await db.workflowTransition.deleteMany({ where: { workflowId } });
      if (patch.transitions.length > 0) {
        await db.workflowTransition.createMany({
          data: patch.transitions.map((t) => toTransitionCreate(workflowId, t)),
        });
      }
    }

    if (patch.name !== undefined) {
      await db.workflow.update({
        where: { id: workflowId },
        data: { name: patch.name },
      });
    }

    const full = await db.workflow.findUniqueOrThrow({
      where: { id: workflowId },
      include: WORKFLOW_INCLUDE,
    });
    return toWorkflow(full);
  }

  async delete(workflowId: string): Promise<void> {
    await this.prisma.workflow.delete({ where: { id: workflowId } });
  }

  async setDefaultAtomic(projectId: string, workflowId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.workflow.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: { isDefault: true },
      }),
    ]);
  }
}
