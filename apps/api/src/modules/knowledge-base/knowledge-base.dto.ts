import { createZodDto } from 'nestjs-zod';
import {
  createArticleSchema,
  updateArticleSchema,
  moveArticleSchema,
  createArticleCommentSchema,
  updateArticleCommentSchema,
  articleSchema,
  articleTreeNodeSchema,
  articleCommentSchema,
} from '@repo/shared/schemas';
import { cursorQuerySchema } from '@/common/dto/cursor-query.dto';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateArticleDto extends createZodDto(createArticleSchema) {}
export class UpdateArticleDto extends createZodDto(updateArticleSchema) {}
export class MoveArticleDto extends createZodDto(moveArticleSchema) {}
export class CreateArticleCommentDto extends createZodDto(createArticleCommentSchema) {}
export class UpdateArticleCommentDto extends createZodDto(updateArticleCommentSchema) {}
export class CursorQueryDto extends createZodDto(cursorQuerySchema) {}

export class ArticleDto extends createZodDto(articleSchema) {}
export class ArticleTreeNodeDto extends createZodDto(articleTreeNodeSchema) {}
export class ArticleCommentDto extends createZodDto(articleCommentSchema) {}
