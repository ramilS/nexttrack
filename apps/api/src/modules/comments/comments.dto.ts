import { createZodDto } from 'nestjs-zod';
import {
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
  commentSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateCommentDto extends createZodDto(createCommentSchema) {}
export class UpdateCommentDto extends createZodDto(updateCommentSchema) {}
export class ListCommentsQueryDto extends createZodDto(listCommentsQuerySchema) {}

export class CommentDto extends createZodDto(commentSchema) {}
