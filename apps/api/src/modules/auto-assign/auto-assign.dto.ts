import { createZodDto } from 'nestjs-zod';
import {
  createAutoAssignRuleSchema,
  updateAutoAssignRuleSchema,
  previewAutoAssignSchema,
  autoAssignRuleSchema,
  autoAssignPreviewSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateAutoAssignRuleDto extends createZodDto(createAutoAssignRuleSchema) {}
export class UpdateAutoAssignRuleDto extends createZodDto(updateAutoAssignRuleSchema) {}
export class PreviewAutoAssignDto extends createZodDto(previewAutoAssignSchema) {}

export class AutoAssignRuleDto extends createZodDto(autoAssignRuleSchema) {}
export class AutoAssignPreviewDto extends createZodDto(autoAssignPreviewSchema) {}
