import { createZodDto } from 'nestjs-zod';
import {
  createVersionSchema,
  updateVersionSchema,
  reorderVersionsSchema,
  releaseVersionSchema,
  versionsQuerySchema,
  versionSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateVersionDto extends createZodDto(createVersionSchema) {}
export class UpdateVersionDto extends createZodDto(updateVersionSchema) {}
export class ReorderVersionsDto extends createZodDto(reorderVersionsSchema) {}
export class ReleaseVersionDto extends createZodDto(releaseVersionSchema) {}
export class VersionsQueryDto extends createZodDto(versionsQuerySchema) {}

export class VersionDto extends createZodDto(versionSchema) {}
