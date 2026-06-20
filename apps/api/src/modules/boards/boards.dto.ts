import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createBoardSchema,
  updateBoardSchema,
  updateColumnsSchema,
  moveIssueSchema,
  boardQuerySchema,
  boardSchema,
  boardDataSchema,
  cfdResponseSchema,
  velocityResponseSchema,
  boardMoveResultSchema,
} from '@repo/shared/schemas';

const cfdQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  interval: z.enum(['day', 'week']).default('day'),
});

const velocityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateBoardDto extends createZodDto(createBoardSchema) {}
export class UpdateBoardDto extends createZodDto(updateBoardSchema) {}
export class UpdateColumnsDto extends createZodDto(updateColumnsSchema) {}
export class MoveIssueDto extends createZodDto(moveIssueSchema) {}
export class BoardQueryDto extends createZodDto(boardQuerySchema) {}
export class CfdQueryDto extends createZodDto(cfdQuerySchema) {}
export class VelocityQueryDto extends createZodDto(velocityQuerySchema) {}

export class BoardDto extends createZodDto(boardSchema) {}
export class BoardDataDto extends createZodDto(boardDataSchema) {}
export class CfdResponseDto extends createZodDto(cfdResponseSchema) {}
export class VelocityResponseDto extends createZodDto(velocityResponseSchema) {}
export class BoardMoveResultDto extends createZodDto(boardMoveResultSchema) {}
