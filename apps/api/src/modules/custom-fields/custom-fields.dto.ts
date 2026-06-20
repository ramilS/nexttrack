import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  reorderCustomFieldsSchema,
  addEnumOptionSchema,
  updateEnumOptionSchema,
  reorderEnumOptionsSchema,
  setFieldValueSchema,
  customFieldSchema,
  customFieldValueSchema,
} from '@repo/shared/schemas';

const deleteEnumOptionQuerySchema = z.object({
  // When true, delete the option even if issues reference it (clearing those
  // values). Parsed from the raw query string; rejects anything but true/false.
  force: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateCustomFieldDto extends createZodDto(createCustomFieldSchema) {}
export class UpdateCustomFieldDto extends createZodDto(updateCustomFieldSchema) {}
export class ReorderCustomFieldsDto extends createZodDto(reorderCustomFieldsSchema) {}
export class AddEnumOptionDto extends createZodDto(addEnumOptionSchema) {}
export class UpdateEnumOptionDto extends createZodDto(updateEnumOptionSchema) {}
export class ReorderEnumOptionsDto extends createZodDto(reorderEnumOptionsSchema) {}
export class DeleteEnumOptionQueryDto extends createZodDto(deleteEnumOptionQuerySchema) {}
export class SetFieldValueDto extends createZodDto(setFieldValueSchema) {}

export class CustomFieldDto extends createZodDto(customFieldSchema) {}
export class CustomFieldValueDto extends createZodDto(customFieldValueSchema) {}
