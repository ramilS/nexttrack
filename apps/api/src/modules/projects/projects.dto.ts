import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  addMemberSchema,
  updateMemberSchema,
  projectSchema,
  projectDetailSchema,
  projectMemberSchema,
  userSummarySchema,
} from '@repo/shared/schemas';

const membersQuerySchema = z.object({
  search: z.string().optional(),
  role: z.guid().optional(),
});

const searchMembersQuerySchema = z.object({
  q: z.string().max(255).trim().default(''),
});

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateProjectDto extends createZodDto(createProjectSchema) {}
export class UpdateProjectDto extends createZodDto(updateProjectSchema) {}
export class ListProjectsQueryDto extends createZodDto(listProjectsQuerySchema) {}
export class AddMemberDto extends createZodDto(addMemberSchema) {}
export class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
export class MembersQueryDto extends createZodDto(membersQuerySchema) {}
export class SearchMembersQueryDto extends createZodDto(searchMembersQuerySchema) {}

export class ProjectDto extends createZodDto(projectSchema) {}
export class ProjectDetailDto extends createZodDto(projectDetailSchema) {}
export class ProjectMemberDto extends createZodDto(projectMemberSchema) {}
export class UserSummaryDto extends createZodDto(userSummarySchema) {}
