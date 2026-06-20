import { createZodDto } from 'nestjs-zod';
import {
  createIssueLinkSchema,
  issueLinkSchema,
  groupedIssueLinksSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateIssueLinkDto extends createZodDto(createIssueLinkSchema) {}

export class IssueLinkDto extends createZodDto(issueLinkSchema) {}
export class GroupedIssueLinksDto extends createZodDto(groupedIssueLinksSchema) {}
