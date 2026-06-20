import { createZodDto } from 'nestjs-zod';
import {
  createTeamSchema,
  updateTeamSchema,
  addTeamMembersSchema,
  teamSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateTeamDto extends createZodDto(createTeamSchema) {}
export class UpdateTeamDto extends createZodDto(updateTeamSchema) {}
export class AddTeamMembersDto extends createZodDto(addTeamMembersSchema) {}

export class TeamDto extends createZodDto(teamSchema) {}
