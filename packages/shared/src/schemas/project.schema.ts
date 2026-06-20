import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination';
import { userSummarySchema } from './common.schema';
import { workflowSchema } from './workflow.schema';

export const PROJECT_KEY_MIN = 2;
export const PROJECT_KEY_MAX = 10;
export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 1000;
export const PROJECT_KEY_REGEX = /^[A-Z0-9]+$/;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const createProjectSchema = z.object({
  key: z
    .string()
    .min(PROJECT_KEY_MIN)
    .max(PROJECT_KEY_MAX)
    .regex(PROJECT_KEY_REGEX, 'Key must contain only uppercase letters and digits')
    .transform((v) => v.toUpperCase().trim()),
  name: z.string().trim().min(PROJECT_NAME_MIN).max(PROJECT_NAME_MAX),
  description: z.string().max(PROJECT_DESCRIPTION_MAX).optional(),
  color: z.string().regex(HEX_COLOR_REGEX).default('#6366f1'),
  iconUrl: z.url().optional(),
  isPrivate: z.boolean().default(false),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectParsed = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(PROJECT_NAME_MIN).max(PROJECT_NAME_MAX).optional(),
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable().optional(),
  color: z.string().regex(HEX_COLOR_REGEX).optional(),
  iconUrl: z.url().nullable().optional(),
  isPrivate: z.boolean().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().optional(),
  isArchived: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false),
  myOnly: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false),
});
export type ListProjectsQuery = z.input<typeof listProjectsQuerySchema>;
export type ListProjectsQueryParsed = z.infer<typeof listProjectsQuerySchema>;

export const memberRoleSchema = z.object({
  id: z.guid(),
  name: z.string(),
  permissions: z.array(z.string()),
});
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const projectMemberSchema = z.object({
  user: userSummarySchema,
  role: memberRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const addMemberSchema = z.object({
  userId: z.guid(),
  roleId: z.guid(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  roleId: z.guid(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const STATUS_CATEGORIES = ['UNSTARTED', 'STARTED', 'DONE'] as const;
export const statusCategorySchema = z.enum(STATUS_CATEGORIES);
export type StatusCategory = z.infer<typeof statusCategorySchema>;

export const projectSchema = z.object({
  id: z.guid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  isPrivate: z.boolean(),
  isArchived: z.boolean(),
  membersCount: z.number().int().nonnegative(),
  myRole: memberRoleSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectTagSchema = z.object({
  id: z.guid(),
  name: z.string(),
  color: z.string(),
  projectId: z.guid(),
  createdAt: z.iso.datetime(),
});
export type ProjectTag = z.infer<typeof projectTagSchema>;

export const projectDetailSchema = projectSchema.extend({
  members: z.array(projectMemberSchema),
  defaultWorkflow: workflowSchema.nullable(),
  tags: z.array(projectTagSchema),
  createdBy: userSummarySchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
