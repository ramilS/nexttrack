import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { StatusCategory } from '@prisma/client';
import { createUserMigrationSchema } from './dto/create-user-migration.dto';
import { createIssueMigrationSchema } from './dto/create-issue-migration.dto';
import { setDatesSchema } from './dto/set-dates.dto';
import { createCommentMigrationSchema } from './dto/create-comment-migration.dto';
import {
  migrationUserResultSchema,
  migrationUserLookupSchema,
  migrationIssueResultSchema,
  migrationIssueLookupSchema,
  migrationCommentResultSchema,
  migrationSuccessSchema,
  migrationStatsSchema,
  migrationCustomFieldsSchema,
  migrationStatusesSchema,
  migrationMembersResultSchema,
  migrationTagResultSchema,
  migrationTagLinkResultSchema,
  migrationLinkResultSchema,
  migrationTimeLogsResultSchema,
  migrationEntityIdResultSchema,
  migrationSprintIssuesResultSchema,
  migrationProjectResultSchema,
  migrationCustomFieldResultSchema,
} from './dto/migration-responses';
import {
  createTagSchema,
  createIssueLinkSchema,
  createBoardSchema,
  createSprintSchema,
  createCustomFieldSchema,
  TIME_LOG_DURATION_MAX_MINUTES,
} from '@repo/shared/schemas';

const findUserByEmailQuerySchema = z.object({
  email: z.email(),
});

const setIssueParentSchema = z.object({
  parentId: z.guid(),
});

const migrationCreateProjectSchema = z.object({
  key: z.string().min(1).max(10),
  name: z.string().trim().min(1).max(255),
  description: z.string().nullable().optional(),
  // Workflow statuses derived from the YouTrack project's State bundle. Empty →
  // the target's default workflow.
  statuses: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        category: z.enum(StatusCategory),
        isInitial: z.boolean(),
        isResolved: z.boolean(),
        ordinal: z.number().int().min(0),
        color: z.string().optional(),
      }),
    )
    .default([]),
});

const setAttachmentMetadataSchema = z.object({
  uploadedById: z.guid().optional(),
  originalCreatedAt: z.iso.datetime().optional(),
});

// Streamed attachment upload: file bytes are the raw request body; this
// metadata rides in the query string. No size cap (migration carries files
// that already existed in YouTrack). The true size is derived from the
// received body — YouTrack's reported size is unreliable.
const migrationAttachmentMetaSchema = z.object({
  filename: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(255),
  uploadedById: z.guid(),
  originalCreatedAt: z.iso.datetime().optional(),
});

const sprintIssuesSchema = z.object({
  issueIds: z
    .array(z.guid())
    .min(1)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate values not allowed',
    }),
});

const migrationTimeLogsSchema = z.object({
  entries: z
    .array(
      z.object({
        userId: z.guid(),
        minutes: z.number().int().min(1).max(TIME_LOG_DURATION_MAX_MINUTES),
        date: z.iso.datetime(),
        description: z.string().max(1000).nullable().optional(),
      }),
    )
    .min(1),
});

const linkIssueTagsSchema = z.object({
  tagIds: z
    .array(z.guid())
    .min(1)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate values not allowed',
    }),
});

const addMembersSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.guid(),
        // NextTrack role name (already mapped from YouTrack by the migrator).
        // Unknown/absent → the default Developer role.
        roleName: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * ZodDto wrappers over the migration schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The Zod
 * schemas (and the z.infer types the service uses) stay in ./dto — only
 * these thin classes are NestJS-aware.
 */
export class CreateUserMigrationReqDto extends createZodDto(createUserMigrationSchema) {}
export class CreateIssueMigrationReqDto extends createZodDto(createIssueMigrationSchema) {}
export class SetDatesReqDto extends createZodDto(setDatesSchema) {}
export class CreateCommentMigrationReqDto extends createZodDto(createCommentMigrationSchema) {}
export class FindUserByEmailQueryDto extends createZodDto(findUserByEmailQuerySchema) {}
export class SetIssueParentDto extends createZodDto(setIssueParentSchema) {}

export class MigrationUserResultDto extends createZodDto(migrationUserResultSchema) {}
export class MigrationUserLookupDto extends createZodDto(migrationUserLookupSchema) {}
export class MigrationIssueResultDto extends createZodDto(migrationIssueResultSchema) {}
export class MigrationIssueLookupDto extends createZodDto(migrationIssueLookupSchema) {}
export class MigrationCommentResultDto extends createZodDto(migrationCommentResultSchema) {}
export class MigrationSuccessDto extends createZodDto(migrationSuccessSchema) {}
export class MigrationStatsDto extends createZodDto(migrationStatsSchema) {}
export class MigrationCustomFieldsDto extends createZodDto(migrationCustomFieldsSchema) {}
export class MigrationStatusesDto extends createZodDto(migrationStatusesSchema) {}
export class AddMembersDto extends createZodDto(addMembersSchema) {}
export class MigrationMembersResultDto extends createZodDto(migrationMembersResultSchema) {}
export class MigrationCreateTagDto extends createZodDto(createTagSchema) {}
export class LinkIssueTagsDto extends createZodDto(linkIssueTagsSchema) {}
export class MigrationTagResultDto extends createZodDto(migrationTagResultSchema) {}
export class MigrationTagLinkResultDto extends createZodDto(migrationTagLinkResultSchema) {}
export class MigrationCreateLinkDto extends createZodDto(createIssueLinkSchema) {}
export class MigrationLinkResultDto extends createZodDto(migrationLinkResultSchema) {}
export class MigrationTimeLogsDto extends createZodDto(migrationTimeLogsSchema) {}
export class MigrationTimeLogsResultDto extends createZodDto(migrationTimeLogsResultSchema) {}
export class MigrationCreateBoardDto extends createZodDto(createBoardSchema) {}
export class MigrationCreateSprintDto extends createZodDto(createSprintSchema) {}
export class MigrationSprintIssuesDto extends createZodDto(sprintIssuesSchema) {}
export class MigrationEntityIdResultDto extends createZodDto(migrationEntityIdResultSchema) {}
export class MigrationSprintIssuesResultDto extends createZodDto(migrationSprintIssuesResultSchema) {}
export class MigrationCreateProjectDto extends createZodDto(migrationCreateProjectSchema) {}
export class MigrationProjectResultDto extends createZodDto(migrationProjectResultSchema) {}
export class SetAttachmentMetadataDto extends createZodDto(setAttachmentMetadataSchema) {}
export class MigrationAttachmentMetaDto extends createZodDto(migrationAttachmentMetaSchema) {}
export class MigrationCreateCustomFieldDto extends createZodDto(createCustomFieldSchema) {}
export class MigrationCustomFieldResultDto extends createZodDto(migrationCustomFieldResultSchema) {}
