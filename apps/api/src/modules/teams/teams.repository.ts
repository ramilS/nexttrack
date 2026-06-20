import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Team } from '@repo/shared/schemas';

const TEAM_INCLUDE = {
  lead: { select: { id: true, name: true, email: true, avatarUrl: true } },
  members: {
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
  _count: { select: { members: true } },
} as const;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof TEAM_INCLUDE }>;

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    projectId: row.projectId,
    lead: row.lead,
    members: row.members.map((m) => ({
      ...m.user,
      joinedAt: m.joinedAt.toISOString(),
    })),
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface TeamCreateInput {
  projectId: string;
  name: string;
  description: string | null;
  leadId: string | null;
}

export interface TeamPatch {
  name?: string;
  description?: string | null;
  leadId?: string | null;
}

@Injectable()
export class TeamsRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({
      where: { projectId },
      include: TEAM_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(toTeam);
  }

  async findOne(projectId: string, teamId: string): Promise<Team | null> {
    const row = await this.prisma.team.findFirst({
      where: { id: teamId, projectId },
      include: TEAM_INCLUDE,
    });
    return row ? toTeam(row) : null;
  }

  async existsInProject(projectId: string, teamId: string): Promise<boolean> {
    const row = await this.prisma.team.findFirst({
      where: { id: teamId, projectId },
      select: { id: true },
    });
    return row !== null;
  }

  async findNameInProject(
    projectId: string,
    name: string,
    excludeId?: string,
  ): Promise<string | null> {
    const row = await this.prisma.team.findFirst({
      where: {
        projectId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  async findCurrentName(projectId: string, teamId: string): Promise<string | null> {
    const row = await this.prisma.team.findFirst({
      where: { id: teamId, projectId },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  async create(input: TeamCreateInput): Promise<Team> {
    const row = await this.prisma.team.create({
      data: input,
      include: TEAM_INCLUDE,
    });
    return toTeam(row);
  }

  async update(teamId: string, patch: TeamPatch): Promise<Team> {
    const data: Prisma.TeamUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.leadId !== undefined) {
      data.lead = patch.leadId
        ? { connect: { id: patch.leadId } }
        : { disconnect: true };
    }

    const row = await this.prisma.team.update({
      where: { id: teamId },
      data,
      include: TEAM_INCLUDE,
    });
    return toTeam(row);
  }

  async delete(teamId: string): Promise<void> {
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  // ─── Members ─────────────────────────────────────────────

  async findExistingMemberIds(teamId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.teamMember.findMany({
      where: { teamId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async addMembers(teamId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.teamMember.createMany({
      data: userIds.map((userId) => ({ teamId, userId })),
    });
  }

  async findMember(teamId: string, userId: string): Promise<{ teamId: string } | null> {
    return this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { teamId: true },
    });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }
}
