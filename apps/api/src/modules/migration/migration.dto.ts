import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
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
} from './dto/migration-responses';
import { createTagSchema } from '@repo/shared/schemas';

const findUserByEmailQuerySchema = z.object({
  email: z.email(),
});

const setIssueParentSchema = z.object({
  parentId: z.guid(),
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
