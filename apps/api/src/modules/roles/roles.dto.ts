import { createZodDto } from 'nestjs-zod';
import {
  createRoleSchema,
  updateRoleSchema,
  roleSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}

export class RoleDto extends createZodDto(roleSchema) {}
