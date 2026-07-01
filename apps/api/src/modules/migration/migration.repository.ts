import { Injectable } from '@nestjs/common';
import { IssueType, Prisma, Priority } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { TiptapDoc } from '@repo/shared/schemas';

export interface MigrationUserCreateInput {
  email: string;
  name: string;
  avatarUrl: string | null;
  isBlocked: boolean;
  migratedFrom: string;
  ytId: string;
}

export interface MigrationUserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  isBlocked: boolean;
  blockedAt: Date | null;
  blockReason: string | null;
  deletedAt: Date | null;
  ytId: string | null;
  migratedFrom: string | null;
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationIssueCreateInput {
  number: number;
  title: string;
  description: TiptapDoc | null;
  type: IssueType;
  priority: Priority;
  statusId: string;
  projectId: string;
  reporterId: string;
  assigneeId: string | null;
  parentId: string | null;
  dueDate: Date | null;
  estimate: number | null;
  resolvedAt: Date | null;
  ytId: string;
}

export interface MigrationIssueRow {
  id: string;
  number: number;
  title: string;
  projectId: string;
  ytId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationFieldValue {
  fieldId: string;
  // External migration payload — validated as `z.unknown()` at the DTO boundary;
  // cast to Prisma's JSON input via `asJson` at the write site.
  value: unknown;
}

export interface MigrationDatesPatch {
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

@Injectable()
export class MigrationRepository {
  constructor(private prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<MigrationUserRow | null> {
    return this.prisma.user.findFirst({ where: { email } });
  }

  async createUser(input: MigrationUserCreateInput): Promise<MigrationUserRow> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        isBlocked: input.isBlocked,
        migratedFrom: input.migratedFrom,
        ytId: input.ytId,
        hasPassword: false,
      },
    });
  }

  async findProjectByKey(
    key: string,
  ): Promise<{ id: string; key: string } | null> {
    return this.prisma.project.findUnique({
      where: { key: key.toUpperCase() },
      select: { id: true, key: true },
    });
  }

  async findIssueByYtId(ytId: string): Promise<MigrationIssueRow | null> {
    return this.prisma.issue.findUnique({ where: { ytId } });
  }

  /**
   * Raises the project's issue counter `lastNumber` to at least `floor`,
   * preserving the high-water mark under concurrent migrations.
   */
  async ensureCounterAtLeast(projectId: string, floor: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO project_issue_counters (project_id, last_number)
      VALUES (${projectId}, ${floor})
      ON CONFLICT (project_id)
      DO UPDATE SET last_number = GREATEST(project_issue_counters.last_number, EXCLUDED.last_number)
    `;
  }

  async createIssue(input: MigrationIssueCreateInput): Promise<MigrationIssueRow> {
    return this.prisma.issue.create({
      data: {
        number: input.number,
        title: input.title,
        description: input.description ? asJson(input.description) : Prisma.JsonNull,
        type: input.type,
        priority: input.priority,
        statusId: input.statusId,
        projectId: input.projectId,
        reporterId: input.reporterId,
        assigneeId: input.assigneeId,
        parentId: input.parentId,
        dueDate: input.dueDate,
        estimate: input.estimate,
        resolvedAt: input.resolvedAt,
        ytId: input.ytId,
      },
    });
  }

  /** Raw update bypasses Prisma's `@default(now())` and `@updatedAt`. */
  async setIssueTimestamps(
    issueId: string,
    patch: MigrationDatesPatch,
  ): Promise<void> {
    if (patch.resolvedAt) {
      await this.prisma.$executeRaw`
        UPDATE issues
        SET created_at  = ${new Date(patch.createdAt)},
            updated_at  = ${new Date(patch.updatedAt)},
            resolved_at = ${new Date(patch.resolvedAt)}
        WHERE id = ${issueId}
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE issues
        SET created_at = ${new Date(patch.createdAt)},
            updated_at = ${new Date(patch.updatedAt)}
        WHERE id = ${issueId}
      `;
    }
  }

  async setIssueParent(issueId: string, parentId: string): Promise<void> {
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { parentId },
    });
  }

  async createFieldValues(
    issueId: string,
    values: MigrationFieldValue[],
  ): Promise<void> {
    if (values.length === 0) return;
    await this.prisma.customFieldValue.createMany({
      data: values.map((fv) => ({
        issueId,
        customFieldId: fv.fieldId,
        value: asJson(fv.value),
      })),
      skipDuplicates: true,
    });
  }

  async existsIssue(issueId: string): Promise<boolean> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true },
    });
    return row !== null;
  }

  async findIssueProjectId(issueId: string): Promise<string | null> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });
    return row?.projectId ?? null;
  }

  async createComment(
    issueId: string,
    authorId: string,
    body: TiptapDoc,
  ): Promise<{ id: string }> {
    return this.prisma.comment.create({
      data: { issueId, authorId, body: asJson(body) },
      select: { id: true },
    });
  }

  async setCommentTimestamp(
    commentId: string,
    originalCreatedAt: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE comments
      SET created_at = ${new Date(originalCreatedAt)},
          updated_at = ${new Date(originalCreatedAt)}
      WHERE id = ${commentId}
    `;
  }

  async getProjectStats(projectId: string): Promise<{
    issues: number;
    comments: number;
    attachments: number;
    timeLogs: number;
  }> {
    const [issues, comments, attachments, timeLogs] = await Promise.all([
      this.prisma.issue.count({ where: { projectId, deletedAt: null } }),
      this.prisma.comment.count({
        where: { issue: { projectId }, deletedAt: null },
      }),
      this.prisma.attachment.count({
        where: { issue: { projectId }, deletedAt: null },
      }),
      this.prisma.timeLog.count({
        where: { issue: { projectId }, deletedAt: null },
      }),
    ]);
    return { issues, comments, attachments, timeLogs };
  }
}
