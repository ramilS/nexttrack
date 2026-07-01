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
} from './dto/migration-responses';

const findUserByEmailQuerySchema = z.object({
  email: z.email(),
});

const setIssueParentSchema = z.object({
  parentId: z.guid(),
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
