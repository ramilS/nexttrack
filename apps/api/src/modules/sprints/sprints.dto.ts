import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createSprintSchema,
  updateSprintSchema,
  closeSprintSchema,
  startSprintSchema,
  sprintIssuesSchema,
  sprintStatusSchema,
  sprintSchema,
  closeSprintResultSchema,
  burndownPointSchema,
  boardIssueCardSchema,
  backlogResponseSchema,
  addSprintIssuesResultSchema,
  removeSprintIssuesResultSchema,
} from '@repo/shared/schemas';
import { paginationQuerySchema } from '@/common/dto/pagination-query.dto';
import { cursorQuerySchema } from '@/common/dto/cursor-query.dto';

const sprintsQuerySchema = paginationQuerySchema.extend({
  status: sprintStatusSchema.optional(),
});

const backlogQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

const backlogIssuesQuerySchema = cursorQuerySchema.extend({
  search: z.string().optional(),
});

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateSprintDto extends createZodDto(createSprintSchema) {}
export class UpdateSprintDto extends createZodDto(updateSprintSchema) {}
export class StartSprintDto extends createZodDto(startSprintSchema) {}
export class CloseSprintDto extends createZodDto(closeSprintSchema) {}
export class SprintIssuesDto extends createZodDto(sprintIssuesSchema) {}
export class SprintsQueryDto extends createZodDto(sprintsQuerySchema) {}
export class BacklogQueryDto extends createZodDto(backlogQuerySchema) {}
export class BacklogIssuesQueryDto extends createZodDto(backlogIssuesQuerySchema) {}

export class SprintDto extends createZodDto(sprintSchema) {}
export class CloseSprintResultDto extends createZodDto(closeSprintResultSchema) {}
export class BurndownPointDto extends createZodDto(burndownPointSchema) {}
export class BoardIssueCardDto extends createZodDto(boardIssueCardSchema) {}
export class BacklogResponseDto extends createZodDto(backlogResponseSchema) {}
export class AddSprintIssuesResultDto extends createZodDto(
  addSprintIssuesResultSchema,
) {}
export class RemoveSprintIssuesResultDto extends createZodDto(
  removeSprintIssuesResultSchema,
) {}
