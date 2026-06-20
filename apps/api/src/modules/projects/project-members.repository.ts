import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { TransactionService } from '@/common/repository/transaction.service';
import type { ProjectMember, UserSummary, MemberRole } from '@repo/shared/schemas';

interface RawMemberRow {
  userId: string;
  joinedAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  roleRef: { id: string; name: string; permissions: Prisma.JsonValue };
}

function toMemberRole(role: RawMemberRow['roleRef']): MemberRole {
  return {
    id: role.id,
    name: role.name,
    permissions: Array.isArray(role.permissions) ? (role.permissions as string[]) : [],
  };
}

function toProjectMember(m: RawMemberRow): ProjectMember {
  return {
    user: m.user,
    role: toMemberRole(m.roleRef),
    joinedAt: m.joinedAt.toISOString(),
  };
}

const MEMBER_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  roleRef: { select: { id: true, name: true, permissions: true } },
} as const;

export interface MemberListQuery {
  search?: string;
  /** Filter by role uuid. */
  roleId?: string;
}

export interface MemberAddInput {
  userId: string;
  projectId: string;
  roleId: string;
  invitedBy: string;
}

@Injectable()
export class ProjectMembersRepository {
  constructor(
    private prisma: PrismaService,
    private txService: TransactionService,
  ) {}

  /** Returns true if the user has any membership in the given project. */
  async isMember(userId: string, projectId: string): Promise<boolean> {
    const row = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { userId: true },
    });
    return row !== null;
  }

  /** Returns the user IDs of all current members of a project. */
  async findMemberIds(projectId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /**
   * Returns the project ids the user is a member of, optionally restricted
   * to a single project. Soft-deleted projects are excluded. Used by the
   * search service to scope hits to projects the user can read.
   */
  async findProjectIdsForUser(
    userId: string,
    restrictToProjectId?: string,
  ): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: {
        userId,
        project: { deletedAt: null },
        ...(restrictToProjectId ? { projectId: restrictToProjectId } : {}),
      },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  /**
   * Lightweight member lookup for autocomplete. Matches `user.name` case-
   * insensitively (and only by name, not email), capped at `limit`. Returns
   * non-deleted users only.
   */
  async findMembersByNameContains(
    projectId: string,
    partial: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; email: string; avatarUrl: string | null }>> {
    const rows = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        user: {
          name: { contains: partial, mode: 'insensitive' },
          deletedAt: null,
        },
      },
      select: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      take: limit,
    });
    return rows.map((m) => m.user);
  }

  /**
   * Returns the subset of `userIds` that are members of the given project.
   * Use to validate that every user in a list belongs to the project without
   * loading the full member roster.
   */
  async filterMembersByUserIds(
    projectId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async findAll(
    projectId: string,
    query?: MemberListQuery,
  ): Promise<ProjectMember[]> {
    const where: Prisma.ProjectMemberWhereInput = { projectId };

    if (query?.roleId) where.roleId = query.roleId;
    if (query?.search) {
      where.user = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const rows = await this.prisma.projectMember.findMany({
      where,
      include: MEMBER_INCLUDE,
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toProjectMember);
  }

  async findMembershipWithPermissions(
    userId: string,
    projectId: string,
  ): Promise<{
    userId: string;
    projectId: string;
    roleId: string;
    permissions: string[];
  } | null> {
    const row = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { roleRef: true },
    });
    if (!row) return null;
    return {
      userId: row.userId,
      projectId: row.projectId,
      roleId: row.roleId,
      permissions: (row.roleRef.permissions ?? []) as string[],
    };
  }

  async findOne(
    userId: string,
    projectId: string,
  ): Promise<{ userId: string; roleId: string } | null> {
    return this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { userId: true, roleId: true },
    });
  }

  async create(input: MemberAddInput): Promise<ProjectMember> {
    const row = await this.prisma.projectMember.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        roleId: input.roleId,
        invitedBy: input.invitedBy,
      },
      include: MEMBER_INCLUDE,
    });
    return toProjectMember(row);
  }

  async updateRole(
    userId: string,
    projectId: string,
    roleId: string,
  ): Promise<ProjectMember> {
    const row = await this.prisma.projectMember.update({
      where: { userId_projectId: { userId, projectId } },
      data: { roleId },
      include: MEMBER_INCLUDE,
    });
    return toProjectMember(row);
  }

  /** Counts the members of a project that hold the given role. */
  async countByRole(projectId: string, roleId: string): Promise<number> {
    return this.prisma.projectMember.count({
      where: { projectId, roleId },
    });
  }

  /**
   * Removes a member and cleans up references (unassigns their issues,
   * removes their watcher rows) in a single transaction.
   */
  async removeWithCleanup(userId: string, projectId: string): Promise<void> {
    await this.txService.run(async (tx) => {
      await tx.issue.updateMany({
        where: { projectId, assigneeId: userId, deletedAt: null },
        data: { assigneeId: null },
      });
      await tx.issueWatcher.deleteMany({
        where: { userId, issue: { projectId } },
      });
      await tx.projectMember.delete({
        where: { userId_projectId: { userId, projectId } },
      });
    });
  }

  /** Members matching a free-text query, capped at 20. */
  async searchMembers(projectId: string, query: string): Promise<UserSummary[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        user: {
          deletedAt: null,
          isBlocked: false,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      take: 20,
    });
    return rows.map((m) => m.user);
  }

  /** Users not yet in the project, optionally narrowed by query. Capped at 20. */
  async searchAddableUsers(projectId: string, query: string): Promise<UserSummary[]> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      isBlocked: false,
      projectMembers: { none: { projectId } },
    };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}
