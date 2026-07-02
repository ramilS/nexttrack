import { Injectable, Inject } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { ErrorCode } from '@repo/shared/error-codes';
import type { TiptapDoc } from '@repo/shared/schemas';
import { migrationConfig } from '@/config';
import { CreateUserMigrationDto } from './dto/create-user-migration.dto';
import { CreateIssueMigrationDto } from './dto/create-issue-migration.dto';
import { SetDatesDto } from './dto/set-dates.dto';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import {
  CustomFieldsRepository,
  getFieldConfig,
} from '@/modules/custom-fields/custom-fields.repository';
import { CustomFieldsService } from '@/modules/custom-fields/custom-fields.service';
import type { CreateCustomFieldParsed } from '@repo/shared/schemas';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { TagsService } from '@/modules/tags/tags.service';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { TimeLogsService } from '@/modules/time-tracking/time-logs.service';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { generateDefaultWorkflow } from '@/modules/workflows/default-workflow';
import { StatusCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Readable } from 'stream';
import { AttachmentsStorageService } from '@/modules/attachments/attachments-storage.service';
import { AttachmentsRepository } from '@/modules/attachments/attachments.repository';
import { BoardsService } from '@/modules/boards/boards.service';
import { SprintsService } from '@/modules/sprints/sprints.service';
import type { CreateBoardParsed, CreateSprintInput } from '@repo/shared/schemas';
import type { CreateTagInput, CreateIssueLinkInput } from '@repo/shared/schemas';
import { IssueLinksService } from '@/modules/issue-links/issue-links.service';

// Seeded system role "Developer" — the default project role for migrated users
// (full contributor: issues/comments/tags/boards/sprints/time). Mirrors the
// PROJECT_ADMIN_ROLE_ID convention in projects.repository.
const DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';
import {
  MigrationRepository,
  MigrationUserRow,
  MigrationIssueRow,
} from './migration.repository';
import type {
  MigrationUser,
  MigrationIssue,
} from './dto/migration-responses';

const DEFAULT_STATUS_COLOR = '#6b7280';

// Workflow status colors are persisted as #RRGGBB — the read schema
// (workflowStatusSchema) enforces exactly six hex digits. YouTrack states can
// carry a 3-digit (#fff) or otherwise non-conforming color, which the loose
// migration request schema (color: z.string()) lets through. Normalize here so
// the stored value always satisfies the response schema; otherwise the project
// and statuses endpoints 500 with a ZodSerializationException after migration.
export function normalizeStatusColor(color?: string): string {
  if (!color) return DEFAULT_STATUS_COLOR;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(color);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_STATUS_COLOR;
}

@Injectable()
export class MigrationService {
  private readonly logger = new AppLogger(MigrationService.name);

  constructor(
    private migrationRepo: MigrationRepository,
    private issuesRepo: IssuesRepository,
    private customFieldsRepo: CustomFieldsRepository,
    private workflowsReader: WorkflowsReader,
    private projectMembersRepo: ProjectMembersRepository,
    private rolesRepo: RolesRepository,
    private customFieldsService: CustomFieldsService,
    private tagsService: TagsService,
    private tagsRepo: TagsRepository,
    private issueLinksService: IssueLinksService,
    private timeLogsService: TimeLogsService,
    private projectsRepo: ProjectsRepository,
    private boardsService: BoardsService,
    private sprintsService: SprintsService,
    private attachmentsStorage: AttachmentsStorageService,
    private attachmentsRepo: AttachmentsRepository,
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

    this.assertBackdatingAllowed(
      Boolean(dto.originalCreatedAt || dto.originalUpdatedAt || dto.originalResolvedAt),
    );

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
    this.assertBackdatingAllowed(true);

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

  async addProjectMembers(
    projectKey: string,
    members: Array<{ userId: string; roleName?: string }>,
  ) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }

    const roles = await this.rolesRepo.findAll();
    const roleIdByName = new Map(
      roles.map((role) => [role.name.toLowerCase(), role.id]),
    );
    const defaultRoleId = roleIdByName.get('developer') ?? DEVELOPER_ROLE_ID;
    const resolveRoleId = (roleName?: string): string =>
      (roleName && roleIdByName.get(roleName.toLowerCase())) || defaultRoleId;

    const added = await this.projectMembersRepo.createManyIgnoreDuplicates(
      members.map((member) => ({
        userId: member.userId,
        projectId: project.id,
        roleId: resolveRoleId(member.roleName),
      })),
    );
    this.logger.log('Migrated project members added', {
      projectId: project.id,
      requested: members.length,
      added,
    });
    return { added };
  }

  async getStatusMap(projectKey: string) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }
    const statuses = await this.workflowsReader.findDefaultStatuses(project.id);
    return { data: statuses.map((s) => ({ id: s.id, name: s.name })) };
  }

  // Idempotent by (project, name): re-running the tag phase returns the
  // existing tag instead of failing on TAG_NAME_TAKEN.
  async createTag(projectKey: string, dto: CreateTagInput) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }

    const existing = await this.tagsRepo.findByNameInsensitive(
      project.id,
      dto.name,
    );
    if (existing) {
      return { data: { id: existing.id, name: existing.name }, existed: true };
    }

    const tag = await this.tagsService.create(project.id, dto);
    this.logger.log('Migrated tag created', {
      tagId: tag.id,
      projectId: project.id,
    });
    return { data: { id: tag.id, name: tag.name }, existed: false };
  }

  async linkIssueTags(issueId: string, tagIds: string[]) {
    const projectId = await this.migrationRepo.findIssueProjectId(issueId);
    if (!projectId) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_ISSUE_NOT_FOUND,
        `Issue ${issueId} not found`,
      );
    }

    await this.tagsRepo.replaceIssueLinksBulk([issueId], tagIds, projectId);
    this.logger.log('Migrated issue tags linked', {
      issueId,
      count: tagIds.length,
    });
    return { linked: tagIds.length };
  }

  // Duplicate links surface as existed=true so the migrator's re-runs and the
  // symmetric double-emission guard stay idempotent.
  async createIssueLink(
    issueId: string,
    dto: CreateIssueLinkInput,
    userId: string,
  ) {
    try {
      const link = await this.issueLinksService.create(issueId, dto, userId);
      return { data: { id: link.id }, existed: false };
    } catch (err) {
      if (
        err instanceof ConflictError &&
        err.code === ErrorCode.LINK_DUPLICATE
      ) {
        return { data: null, existed: true };
      }
      throw err;
    }
  }

  async createTimeLogs(
    issueId: string,
    entries: Array<{
      userId: string;
      minutes: number;
      date: string;
      description?: string | null;
    }>,
  ) {
    const created = await this.timeLogsService.importMany(
      issueId,
      entries.map((entry) => ({
        userId: entry.userId,
        minutes: entry.minutes,
        date: entry.date,
        description: entry.description ?? null,
      })),
    );
    return { created };
  }

  // Idempotent by key. Provisions the target workflow from the YouTrack states
  // the migrator sends (so issue statuses map by name); empty statuses → the
  // built-in default workflow.
  async createProject(
    dto: {
      key: string;
      name: string;
      description?: string | null;
      statuses: Array<{
        name: string;
        category: StatusCategory;
        isInitial: boolean;
        isResolved: boolean;
        ordinal: number;
        color?: string;
      }>;
    },
    userId: string,
  ) {
    const existing = await this.projectsRepo.findEntityByKey(dto.key);
    if (existing) {
      return { data: { id: existing.id }, existed: true };
    }

    const project = await this.projectsRepo.createWithWorkflow(
      {
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        color: null,
        iconUrl: null,
        isPrivate: false,
        createdById: userId,
      },
      this.buildWorkflowSeed(dto.statuses),
    );
    this.logger.log('Migrated project created', {
      projectId: project.id,
      key: dto.key,
    });
    return { data: { id: project.id }, existed: false };
  }

  private buildWorkflowSeed(
    statuses: Array<{
      name: string;
      category: StatusCategory;
      isInitial: boolean;
      isResolved: boolean;
      ordinal: number;
      color?: string;
    }>,
  ) {
    if (statuses.length === 0) return generateDefaultWorkflow();

    const seedStatuses = statuses.map((s, i) => ({
      id: randomUUID(),
      name: s.name,
      color: normalizeStatusColor(s.color),
      category: s.category,
      isInitial: s.isInitial,
      isResolved: s.isResolved,
      ordinal: s.ordinal ?? i,
    }));
    // Exactly one initial status is required; default to the first.
    if (!seedStatuses.some((s) => s.isInitial)) {
      seedStatuses[0]!.isInitial = true;
    }
    // Permissive transitions: from anywhere to any status, so the migrated
    // workflow stays usable in the UI (YouTrack's transition rules aren't ported).
    const transitions = seedStatuses.map((s) => ({
      id: randomUUID(),
      name: `To ${s.name}`,
      fromStatusId: '*',
      toStatusId: s.id,
      requiredRole: null,
    }));
    return { name: 'Default', isDefault: true, statuses: seedStatuses, transitions };
  }

  async createBoard(projectKey: string, dto: CreateBoardParsed, userId: string) {
    const project = await this.projectsRepo.findEntityByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }
    const board = await this.boardsService.create(project, dto, userId);
    this.logger.log('Migrated board created', {
      boardId: board.id,
      projectId: project.id,
    });
    return { data: { id: board.id } };
  }

  async createSprint(boardId: string, dto: CreateSprintInput) {
    const sprint = await this.sprintsService.create(boardId, dto);
    this.logger.log('Migrated sprint created', { sprintId: sprint.id, boardId });
    return { data: { id: sprint.id } };
  }

  async addSprintIssues(
    boardId: string,
    sprintId: string,
    issueIds: string[],
  ) {
    const result = await this.sprintsService.addIssues(
      boardId,
      sprintId,
      issueIds,
    );
    return { added: result.added };
  }

  // Backdate a just-uploaded attachment to its original YouTrack date + author
  // (the normal upload path stamps now + the migration admin).
  async setAttachmentMetadata(
    attachmentId: string,
    dto: { uploadedById?: string; originalCreatedAt?: string },
  ) {
    this.assertBackdatingAllowed(Boolean(dto.originalCreatedAt));
    await this.migrationRepo.setAttachmentMetadata(attachmentId, {
      uploadedById: dto.uploadedById,
      createdAt: dto.originalCreatedAt
        ? new Date(dto.originalCreatedAt)
        : undefined,
    });
    return { success: true };
  }

  // Streamed attachment import: buffers the raw request body, then stores it
  // with the original author + date. Deliberately bypasses the interactive
  // upload's 50 MB cap and MIME allow-list — migration is an admin-trusted bulk
  // path carrying files that already existed in YouTrack. The source is
  // trusted; do NOT reuse this for user-facing uploads.
  //
  // The body arrives chunked (no reliable length up front — YouTrack's reported
  // size is often wrong), so we buffer it and take the TRUE size from the
  // buffer. Streaming straight to S3 would need an accurate ContentLength and
  // fail with IncompleteBody/ExcessData on any mismatch.
  async uploadAttachment(
    issueId: string,
    stream: Readable,
    meta: {
      filename: string;
      mimeType: string;
      uploadedById: string;
      originalCreatedAt?: string;
    },
  ) {
    const projectId = await this.migrationRepo.findIssueProjectId(issueId);
    if (!projectId) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    this.assertBackdatingAllowed(Boolean(meta.originalCreatedAt));

    const buffer = await this.collectStream(stream);
    const attachmentId = randomUUID();
    const storagePath = `attachments/${issueId}/${attachmentId}${extname(meta.filename).toLowerCase()}`;

    await this.attachmentsStorage.uploadBuffer(buffer, storagePath, meta.mimeType);

    const raw = await this.attachmentsRepo.create({
      id: attachmentId,
      issueId,
      uploadedById: meta.uploadedById,
      filename: meta.filename,
      storagePath,
      mimeType: meta.mimeType,
      size: buffer.length,
    });

    if (meta.originalCreatedAt) {
      await this.migrationRepo.setAttachmentMetadata(attachmentId, {
        createdAt: new Date(meta.originalCreatedAt),
      });
    }

    this.logger.log('Migrated attachment uploaded', {
      attachmentId: raw.id,
      issueId,
      size: buffer.length,
    });
    return { data: { id: raw.id } };
  }

  private collectStream(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getCustomFieldMap(projectKey: string) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }
    const fields = await this.customFieldsRepo.findManyByProject(project.id);
    return { data: fields.map((field) => this.toMigrationField(field)) };
  }

  // Create a custom field in the target project, idempotent by name so a
  // re-run (or --resume) does not duplicate it. Enum option ids are generated
  // by CustomFieldsService.create; the migrator resolves values back to those
  // ids by option name via getCustomFieldMap.
  async createCustomField(projectKey: string, dto: CreateCustomFieldParsed) {
    const project = await this.migrationRepo.findProjectByKey(projectKey);
    if (!project) {
      throw new NotFoundError(
        ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
        `Project ${projectKey} not found`,
      );
    }

    const existing = (
      await this.customFieldsRepo.findManyByProject(project.id)
    ).find((f) => f.name === dto.name);
    if (existing) {
      return { data: this.toMigrationField(existing), existed: true };
    }

    const created = await this.customFieldsService.create(project.id, dto);
    this.logger.log('Migrated custom field created', {
      fieldId: created.id,
      projectId: project.id,
      type: dto.type,
    });
    return { data: this.toMigrationField(created), existed: false };
  }

  private toMigrationField(field: {
    id: string;
    name: string;
    type: unknown;
    config: unknown;
  }) {
    return {
      id: field.id,
      name: field.name,
      type: String(field.type),
      options: (getFieldConfig(field).options ?? []).map((option) => ({
        id: option.id,
        name: option.name,
      })),
    };
  }

  async createComment(
    issueId: string,
    authorId: string,
    body: TiptapDoc,
    originalCreatedAt?: string,
  ) {
    this.assertBackdatingAllowed(Boolean(originalCreatedAt));

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

  private assertBackdatingAllowed(hasBackdatedInput: boolean): void {
    if (hasBackdatedInput && !this.migration.allowBackdatedRecords) {
      throw new ValidationError(
        ErrorCode.MIGRATION_BACKDATING_DISABLED,
        'Backdated timestamps are disabled. Set MIGRATION_ALLOW_BACKDATED_RECORDS=true to preserve original dates.',
      );
    }
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
