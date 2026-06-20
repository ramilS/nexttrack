import { Injectable } from '@nestjs/common';
import { IssueLinkType, IssueType, Prisma, Priority } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface GanttIssueRow {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  priority: Priority;
  statusId: string;
  assigneeId: string | null;
  parentId: string | null;
  sprintId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  estimate: number | null;
  spent: number;
  projectKey: string;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  sprint: { id: string; name: string } | null;
  children: Array<{ id: string; statusId: string }>;
  dependencyTargetIds: string[];
}

export interface GanttFilters {
  projectId: string;
  from: Date;
  to: Date;
  sprintId?: string;
  assigneeId?: string;
}

@Injectable()
export class GanttRepository {
  constructor(private prisma: PrismaService) {}

  async findIssuesInRange(filters: GanttFilters): Promise<GanttIssueRow[]> {
    const where: Prisma.IssueWhereInput = {
      projectId: filters.projectId,
      deletedAt: null,
      OR: [
        { startDate: { gte: filters.from, lte: filters.to } },
        { dueDate: { gte: filters.from, lte: filters.to } },
        { AND: [{ startDate: { lte: filters.from } }, { dueDate: { gte: filters.to } }] },
        { startDate: null, dueDate: null },
      ],
    };

    if (filters.sprintId) where.sprintId = filters.sprintId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;

    const rows = await this.prisma.issue.findMany({
      where,
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        priority: true,
        statusId: true,
        assigneeId: true,
        parentId: true,
        sprintId: true,
        startDate: true,
        dueDate: true,
        estimate: true,
        spent: true,
        project: { select: { key: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        sprint: { select: { id: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, statusId: true },
        },
        linksFrom: {
          where: { type: IssueLinkType.DEPENDS_ON },
          select: { targetIssueId: true },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      type: r.type,
      priority: r.priority,
      statusId: r.statusId,
      assigneeId: r.assigneeId,
      parentId: r.parentId,
      sprintId: r.sprintId,
      startDate: r.startDate,
      dueDate: r.dueDate,
      estimate: r.estimate,
      spent: r.spent,
      projectKey: r.project.key,
      assignee: r.assignee,
      sprint: r.sprint,
      children: r.children,
      dependencyTargetIds: r.linksFrom.map((l) => l.targetIssueId),
    }));
  }
}
