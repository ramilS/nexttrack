import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { TransactionService } from '@/common/repository/transaction.service';
import type {
  Project,
  ProjectDetail,
  ProjectMember,
  ProjectTag,
  MemberRole,
  PaginationMeta,
  WorkflowStatus,
  WorkflowTransition,
} from '@repo/shared/schemas';
import { generateDefaultWorkflow } from '@/modules/workflows/default-workflow';
import { toWorkflow } from '@/modules/workflows/workflows.repository';

const PROJECT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Full project row as stored, used by the controller-facing context (set by
 * `ProjectContextInterceptor`) — keeps all the fields any controller might
 * read. Repositories own the Prisma type; consumers depend on this interface.
 */
export interface ProjectEntity {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  iconUrl: string | null;
  isPrivate: boolean;
  archivedAt: Date | null;
  archivedById: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectListFilters {
  page: number;
  perPage: number;
  search?: string;
  isArchived?: boolean;
  /** When true, only include projects where the current user is a member. */
  myOnly?: boolean;
  /** When true, the lister is an admin (broader visibility rules apply). */
  isAdmin: boolean;
  userId: string;
}

export interface ProjectUpdatePatch {
  name?: string;
  description?: string | null;
  color?: string | null;
  iconUrl?: string | null;
  isPrivate?: boolean;
}

export interface ProjectCreateInput {
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  iconUrl: string | null;
  isPrivate: boolean;
  createdById: string;
}

interface RoleRefRow {
  id: string;
  name: string;
  permissions: Prisma.JsonValue;
}

interface ListMemberRow {
  userId: string;
  roleRef: RoleRefRow;
}

interface DetailMemberRow {
  userId: string;
  joinedAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  roleRef: RoleRefRow;
}

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  iconUrl: string | null;
  isPrivate: boolean;
  archivedAt: Date | null;
  archivedById: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

function toEntity(row: ProjectRow): ProjectEntity {
  return row;
}

function toMemberRole(role: RoleRefRow): MemberRole {
  return {
    id: role.id,
    name: role.name,
    permissions: Array.isArray(role.permissions) ? (role.permissions as string[]) : [],
  };
}

function toProject(
  row: ProjectRow & {
    _count: { members: number };
    members: ListMemberRow[];
  },
  userId: string,
): Project {
  const myRoleRef = row.members.find((m) => m.userId === userId)?.roleRef;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    color: row.color ?? '#6366f1',
    iconUrl: row.iconUrl,
    isPrivate: row.isPrivate,
    isArchived: row.archivedAt != null,
    membersCount: row._count.members,
    myRole: myRoleRef ? toMemberRole(myRoleRef) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProjectMember(m: DetailMemberRow): ProjectMember {
  return {
    user: m.user,
    role: toMemberRole(m.roleRef),
    joinedAt: m.joinedAt.toISOString(),
  };
}

function toTag(t: {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: Date;
}): ProjectTag {
  return {
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    color: t.color,
    createdAt: t.createdAt.toISOString(),
  };
}

const DETAIL_INCLUDE = {
  members: {
    take: 10,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      roleRef: { select: { id: true, name: true, permissions: true } },
    },
  },
  workflows: {
    where: { isDefault: true },
    take: 1,
    include: { statuses: { orderBy: { ordinal: 'asc' } }, transitions: true },
  },
  tags: true,
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { members: true } },
} as const;

@Injectable()
export class ProjectsRepository {
  constructor(
    private prisma: PrismaService,
    private txService: TransactionService,
  ) {}

  async findEntityByKey(
    key: string,
    options?: { includeDeleted?: boolean; mustBeDeleted?: boolean },
  ): Promise<ProjectEntity | null> {
    const where: Prisma.ProjectWhereInput = { key: key.toUpperCase() };
    if (options?.mustBeDeleted) {
      where.deletedAt = { not: null };
    } else if (!options?.includeDeleted) {
      where.deletedAt = null;
    }
    const row = await this.prisma.project.findFirst({ where });
    return row ? toEntity(row) : null;
  }

  async findActiveById(projectId: string): Promise<ProjectEntity | null> {
    const row = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    return row ? toEntity(row) : null;
  }

  async existsByKey(key: string): Promise<boolean> {
    const row = await this.prisma.project.findUnique({
      where: { key: key.toUpperCase() },
      select: { id: true },
    });
    return row !== null;
  }

  /** All non-deleted project ids. Used by admin search and reindex-all flows. */
  async findAllActiveIds(): Promise<string[]> {
    const rows = await this.prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Returns `{key, name}` rows for non-deleted, non-archived projects whose
   * key matches `partial` (case-insensitive contains). Used by autocomplete.
   */
  async findActiveByKeyContains(
    partial: string,
    limit: number,
  ): Promise<Array<{ key: string; name: string }>> {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        key: { contains: partial, mode: 'insensitive' },
      },
      select: { key: true, name: true },
      take: limit,
    });
  }

  async findPage(
    filters: ProjectListFilters,
  ): Promise<{ items: Project[]; meta: PaginationMeta }> {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      archivedAt: filters.isArchived ? { not: null } : null,
    };

    if (!filters.isAdmin || filters.myOnly) {
      where.members = { some: { userId: filters.userId } };
    }
    if (!filters.isAdmin) {
      where.OR = [{ isPrivate: false }, { members: { some: { userId: filters.userId } } }];
    }
    if (filters.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { key: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip: (filters.page - 1) * filters.perPage,
        take: filters.perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true } },
          members: {
            where: { userId: filters.userId },
            select: {
              userId: true,
              roleRef: { select: { id: true, name: true, permissions: true } },
            },
            take: 1,
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      items: rows.map((r) => toProject(r, filters.userId)),
      meta: {
        total,
        page: filters.page,
        perPage: filters.perPage,
        totalPages: Math.ceil(total / filters.perPage),
      },
    };
  }

  async findDetailByKey(
    key: string,
    userId: string,
  ): Promise<ProjectDetail | null> {
    const row = await this.prisma.project.findFirst({
      where: { key: key.toUpperCase(), deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!row) return null;
    return this.buildDetail(row, userId);
  }

  /**
   * Creates a project together with the initial admin membership, issue
   * counter, and default workflow, all in a single transaction.
   */
  async createWithDefaults(input: ProjectCreateInput): Promise<ProjectDetail> {
    return this.createWithWorkflow(input, generateDefaultWorkflow());
  }

  /**
   * Like createWithDefaults but provisions a caller-supplied workflow (used by
   * the migration tool to build the target workflow from YouTrack states, so
   * issue statuses map by name). Same single-transaction shape as the default.
   */
  async createWithWorkflow(
    input: ProjectCreateInput,
    workflow: {
      name: string;
      isDefault: boolean;
      statuses: WorkflowStatus[];
      transitions: WorkflowTransition[];
    },
  ): Promise<ProjectDetail> {
    return this.txService.run(async (tx) => {
      const row = await tx.project.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          color: input.color,
          iconUrl: input.iconUrl,
          isPrivate: input.isPrivate,
          createdById: input.createdById,
          members: {
            create: { userId: input.createdById, roleId: PROJECT_ADMIN_ROLE_ID },
          },
          issueCounter: { create: { lastNumber: 0 } },
          workflows: {
            create: {
              name: workflow.name,
              isDefault: workflow.isDefault,
              statuses: {
                create: workflow.statuses.map((s) => ({
                  id: s.id,
                  name: s.name,
                  color: s.color,
                  category: s.category,
                  isInitial: s.isInitial,
                  isResolved: s.isResolved,
                  ordinal: s.ordinal,
                })),
              },
            },
          },
        },
        include: DETAIL_INCLUDE,
      });

      // Transitions reference status ids, so they are created after the
      // workflow + statuses exist (within the same transaction).
      const createdWorkflow = await tx.workflow.findFirstOrThrow({
        where: { projectId: row.id, isDefault: true },
        select: { id: true },
      });
      await tx.workflowTransition.createMany({
        data: workflow.transitions.map((t) => ({
          id: t.id,
          workflowId: createdWorkflow.id,
          name: t.name,
          fromStatusId: t.fromStatusId === '*' ? null : t.fromStatusId,
          toStatusId: t.toStatusId,
          requiredRole: t.requiredRole,
        })),
      });

      return this.buildDetail(row, input.createdById);
    });
  }

  async update(projectId: string, patch: ProjectUpdatePatch): Promise<void> {
    const data: Prisma.ProjectUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.color !== undefined) data.color = patch.color;
    if (patch.iconUrl !== undefined) data.iconUrl = patch.iconUrl;
    if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;

    await this.prisma.project.update({ where: { id: projectId }, data });
  }

  async setArchive(
    projectId: string,
    archivedAt: Date | null,
    archivedById: string | null,
  ): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
      data: { archivedAt, archivedById },
    });
  }

  async setDelete(
    projectId: string,
    deletedAt: Date | null,
    deletedById: string | null,
  ): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt, deletedById },
    });
  }

  /**
   * Cascading soft-delete: marks all active issues + custom fields and the
   * project itself as deleted in a single transaction.
   */
  async softDeleteCascade(projectId: string, deletedBy: string): Promise<void> {
    const now = new Date();
    await this.txService.run(async (tx) => {
      await tx.issue.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: now, deletedById: deletedBy },
      });
      await tx.customField.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: now, deletedById: deletedBy },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { deletedAt: now, deletedById: deletedBy },
      });
    });
  }

  /** Returns the IDs of resolved statuses from the project's default workflow. */
  async findResolvedStatusIds(projectId: string): Promise<string[]> {
    const wf = await this.prisma.workflow.findFirst({
      where: { projectId, isDefault: true },
      select: { statuses: { where: { isResolved: true }, select: { id: true } } },
    });
    return wf ? wf.statuses.map((s) => s.id) : [];
  }

  /**
   * Counts non-resolved, non-deleted issues in a project. Used to gate
   * project deletion (a project with open issues cannot be deleted).
   */
  async countOpenIssues(
    projectId: string,
    resolvedStatusIds: string[],
  ): Promise<number> {
    return this.prisma.issue.count({
      where: {
        projectId,
        deletedAt: null,
        statusId: resolvedStatusIds.length
          ? { notIn: resolvedStatusIds }
          : undefined,
      },
    });
  }

  // ─── Private ─────────────────────────────────────────────────

  private buildDetail(
    row: ProjectRow & {
      _count: { members: number };
      members: DetailMemberRow[];
      workflows: Array<Parameters<typeof toWorkflow>[0]>;
      tags: Array<Parameters<typeof toTag>[0]>;
      createdBy: { id: string; name: string; email: string; avatarUrl: string | null };
    },
    userId: string,
  ): ProjectDetail {
    const myMember = row.members.find((m) => m.userId === userId);
    const wf = row.workflows[0];
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      color: row.color ?? '#6366f1',
      iconUrl: row.iconUrl,
      isPrivate: row.isPrivate,
      isArchived: row.archivedAt != null,
      membersCount: row._count.members,
      myRole: myMember ? toMemberRole(myMember.roleRef) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      members: row.members.map(toProjectMember),
      defaultWorkflow: wf ? toWorkflow(wf) : null,
      tags: row.tags.map(toTag),
      createdBy: row.createdBy,
    };
  }
}
