import { createZodDto } from 'nestjs-zod';
import {
  createTagSchema,
  updateTagSchema,
  addIssueTagSchema,
  tagSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateTagDto extends createZodDto(createTagSchema) {}
export class UpdateTagDto extends createZodDto(updateTagSchema) {}
export class AddIssueTagDto extends createZodDto(addIssueTagSchema) {}

export class TagDto extends createZodDto(tagSchema) {}
