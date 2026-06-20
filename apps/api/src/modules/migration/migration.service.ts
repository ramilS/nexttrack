import { Injectable, Inject } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { ErrorCode } from '@repo/shared/error-codes';
import type { TiptapDoc } from '@repo/shared/schemas';
import { migrationConfig } from '@/config';
import { CreateUserMigrationDto } from './dto/create-user-migration.dto';
import { CreateIssueMigrationDto } from './dto/create-issue-migration.dto';
import { SetDatesDto } from './dto/set-dates.dto';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import {
  MigrationRepository,
  MigrationUserRow,
  MigrationIssueRow,
} from './migration.repository';
import type {
  MigrationUser,
  MigrationIssue,
} from './dto/migration-responses';

@Injectable()
export class MigrationService {
  private readonly logger = new AppLogger(MigrationService.name);

  constructor(
    private migrationRepo: MigrationRepository,
    private issuesRepo: IssuesRepository,
    @Inject(migrationConfig.KEY)
    private migration: ConfigType<typeof migrationConfig>,
  ) {}

  async createUser(dto: CreateUserMigrationDto) {
    const existing = await this.migrationRepo.findUserByEmail(dto.email);
    if (existing) {
      return { data: this.toMigrationUser(existing), existed: true };
    }

    const user = await this.migrationRepo.createUser({
      email: dto.email,
      name: dto.name,
      avatarUrl: dto.avatarUrl ?? null,
      isBlocked: dto.isBlocked,
      migratedFrom: dto.migratedFrom,
      ytId: dto.ytId,
    });
    this.logger.log('Migrated user created', {
      userId: user.id,
      ytId: dto.ytId,
      migratedFrom: dto.migratedFrom,
    });

    return { data: this.toMigrationUser(user), existed: false };
  }

  async createIssue(projectKey: string, dto: CreateIssueMigrationDto) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }

    const existingByYtId = await this.migrationRepo.findIssueByYtId(dto.ytId);
    if (existingByYtId) {
      return { data: this.toMigrationIssue(existingByYtId), existed: true };
    }

    const number =
      dto.ytNumber ?? (await this.issuesRepo.getNextNumber(project.id));

    if (dto.ytNumber) {
      await this.migrationRepo.ensureCounterAtLeast(project.id, dto.ytNumber);
    }

    const issue = await this.migrationRepo.createIssue({
      number,
      title: dto.title,
      description: dto.description ?? null,
      type: dto.type,
      priority: dto.priority,
      statusId: dto.statusId,
      projectId: project.id,
      reporterId: dto.reporterId,
      assigneeId: dto.assigneeId ?? null,
      parentId: dto.parentId ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      estimate: dto.estimate ?? null,
      resolvedAt: dto.originalResolvedAt ? new Date(dto.originalResolvedAt) : null,
      ytId: dto.ytId,
    });

    if (dto.originalCreatedAt || dto.originalUpdatedAt) {
      await this.migrationRepo.setIssueTimestamps(issue.id, {
        createdAt: dto.originalCreatedAt ?? issue.createdAt.toISOString(),
        updatedAt: dto.originalUpdatedAt ?? issue.updatedAt.toISOString(),
      });
    }

    if (dto.fieldValues.length > 0) {
      await this.migrationRepo.createFieldValues(
        issue.id,
        dto.fieldValues.map((fv) => ({ fieldId: fv.fieldId, value: fv.value })),
      );
    }

    this.logger.log('Migrated issue created', {
      issueId: issue.id,
      projectId: project.id,
      number,
      ytId: dto.ytId,
      fieldValuesCount: dto.fieldValues.length,
    });

    return { data: this.toMigrationIssue(issue), existed: false };
  }

  async findByYtId(ytId: string) {
    const issue = await this.migrationRepo.findIssueByYtId(ytId);
    return { data: issue ? this.toMigrationIssue(issue) : null };
  }

  async findUserByEmail(email: string) {
    const user = await this.migrationRepo.findUserByEmail(email);
    return { data: user ? this.toMigrationUser(user) : null };
  }

  async setOriginalDates(issueId: string, dto: SetDatesDto) {
    if (!(await this.migrationRepo.existsIssue(issueId))) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_ISSUE_NOT_FOUND,
        `Issue ${issueId} not found`,
      );
    }

    await this.migrationRepo.setIssueTimestamps(issueId, {
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      ...(dto.resolvedAt ? { resolvedAt: dto.resolvedAt } : {}),
    });

    return { success: true };
  }

  async setIssueParent(issueId: string, parentId: string) {
    await this.migrationRepo.setIssueParent(issueId, parentId);
    return { success: true };
  }

  async getProjectStats(projectKey: string) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }

    const counts = await this.migrationRepo.getProjectStats(project.id);
    return {
      projectKey,
      projectId: project.id,
      counts,
    };
  }

  async createComment(
    issueId: string,
    authorId: string,
    body: TiptapDoc,
    originalCreatedAt?: string,
  ) {
    const comment = await this.migrationRepo.createComment(
      issueId,
      authorId,
      body,
    );
    if (originalCreatedAt) {
      await this.migrationRepo.setCommentTimestamp(comment.id, originalCreatedAt);
    }
    this.logger.log('Migrated comment created', {
      commentId: comment.id,
      issueId,
      authorId,
    });
    return { data: comment };
  }

  // Response boundary: maps Date columns to ISO strings so the shape matches
  // the migration response schemas (the ZodSerializerDto targets).
  private toMigrationUser(user: MigrationUserRow): MigrationUser {
    return {
      ...user,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toMigrationIssue(issue: MigrationIssueRow): MigrationIssue {
    return {
      ...issue,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }
}
