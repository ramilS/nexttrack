import { Injectable } from '@nestjs/common';
import { IssueLinkType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

const ISSUE_SELECT = {
  id: true,
  number: true,
  title: true,
  statusId: true,
  priority: true,
  type: true,
  project: {
    select: {
      key: true,
      workflows: {
        where: { isDefault: true },
        take: 1,
        select: { statuses: { orderBy: { ordinal: 'asc' } } },
      },
    },
  },
} as const;

const LINK_INCLUDE = {
  sourceIssue: { select: ISSUE_SELECT },
  targetIssue: { select: ISSUE_SELECT },
  createdBy: { select: { id: true, name: true } },
} as const;

export type IssueLinkRow = Prisma.IssueLinkGetPayload<{
  include: typeof LINK_INCLUDE;
}>;

export interface IssueLinkSummary {
  id: string;
  sourceIssueId: string;
  targetIssueId: string;
  type: IssueLinkType;
}

export interface IssueLinkProjectRef {
  id: string;
  number: number;
  projectKey: string;
}

@Injectable()
export class IssueLinksRepository {
  constructor(private prisma: PrismaService) {}

  async findActiveProjectRef(
    issueId: string,
  ): Promise<{ id: string; projectId: string; number: number } | null> {
    return this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: { id: true, projectId: true, number: true },
    });
  }

  async findIssueRefsByIds(ids: string[]): Promise<Map<string, IssueLinkProjectRef>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.issue.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        number: true,
        project: { select: { key: true } },
      },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        { id: r.id, number: r.number, projectKey: r.project.key },
      ]),
    );
  }

  async findExisting(
    sourceIssueId: string,
    targetIssueId: string,
    type: IssueLinkType,
  ): Promise<{ id: string } | null> {
    return this.prisma.issueLink.findUnique({
      where: {
        sourceIssueId_targetIssueId_type: {
          sourceIssueId,
          targetIssueId,
          type,
        },
      },
      select: { id: true },
    });
  }

  async create(input: {
    type: IssueLinkType;
    sourceIssueId: string;
    targetIssueId: string;
    createdById: string;
  }): Promise<IssueLinkRow> {
    return this.prisma.issueLink.create({
      data: input,
      include: LINK_INCLUDE,
    });
  }

  async findByIdInIssue(
    linkId: string,
    issueId: string,
  ): Promise<IssueLinkSummary | null> {
    const row = await this.prisma.issueLink.findFirst({
      where: {
        id: linkId,
        OR: [{ sourceIssueId: issueId }, { targetIssueId: issueId }],
      },
      select: { id: true, sourceIssueId: true, targetIssueId: true, type: true },
    });
    return row;
  }

  async delete(linkId: string): Promise<void> {
    await this.prisma.issueLink.delete({ where: { id: linkId } });
  }

  /** Outward + inward links for a perspective issue, both ordered desc by createdAt. */
  async findByIssue(
    issueId: string,
  ): Promise<{ outward: IssueLinkRow[]; inward: IssueLinkRow[] }> {
    const [outward, inward] = await this.prisma.$transaction([
      this.prisma.issueLink.findMany({
        where: { sourceIssueId: issueId },
        include: LINK_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.issueLink.findMany({
        where: { targetIssueId: issueId },
        include: LINK_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { outward, inward };
  }

  /**
   * Every issue id reachable via DEPENDS_ON edges from `startIssueId`, resolved
   * in a single recursive CTE instead of one query per visited node. `UNION`
   * (not `UNION ALL`) dedupes the working set by id, so the walk terminates on
   * a finite graph even if the data already contains a cycle. Used for
   * dependency-cycle validation when adding a new DEPENDS_ON link.
   */
  async findDependsOnReachable(startIssueId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE reachable(id) AS (
        SELECT target_issue_id
        FROM issue_links
        WHERE source_issue_id = ${startIssueId}
          AND type = ${IssueLinkType.DEPENDS_ON}::issue_link_type
        UNION
        SELECT l.target_issue_id
        FROM issue_links l
        JOIN reachable r ON l.source_issue_id = r.id
        WHERE l.type = ${IssueLinkType.DEPENDS_ON}::issue_link_type
      )
      SELECT id FROM reachable
    `;
    return rows.map((r) => r.id);
  }
}
