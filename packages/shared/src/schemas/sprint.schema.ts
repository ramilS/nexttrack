import { z } from 'zod';
import { uniqueUuidArray } from './common.schema';

export const SPRINT_NAME_MAX = 100;
export const SPRINT_GOAL_MAX = 1000;
export const SPRINT_ISSUES_MAX = 1000;

export const SPRINT_STATUSES = ['PLANNING', 'ACTIVE', 'CLOSED'] as const;
export const sprintStatusSchema = z.enum(SPRINT_STATUSES);
export type SprintStatus = z.infer<typeof sprintStatusSchema>;

export const INCOMPLETE_ISSUE_ACTIONS = ['MOVE_TO_BACKLOG', 'MOVE_TO_NEXT_SPRINT'] as const;
export const incompleteIssueActionSchema = z.enum(INCOMPLETE_ISSUE_ACTIONS);
export type IncompleteIssueAction = z.infer<typeof incompleteIssueActionSchema>;

const dateRangeRefinement = (data: { startDate?: string; endDate?: string }) =>
  !data.startDate || !data.endDate || data.endDate > data.startDate;
const dateRangeError = { message: 'endDate must be after startDate', path: ['endDate'] };

// ─── Request schemas ─────────────────────────────────────────

export const createSprintSchema = z
  .object({
    name: z.string().trim().min(1).max(SPRINT_NAME_MAX),
    goal: z.string().max(SPRINT_GOAL_MAX).optional(),
    startDate: z.iso.datetime().optional(),
    endDate: z.iso.datetime().optional(),
  })
  .refine(dateRangeRefinement, dateRangeError);
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z.object({
  name: z.string().trim().min(1).max(SPRINT_NAME_MAX).optional(),
  goal: z.string().max(SPRINT_GOAL_MAX).nullable().optional(),
  startDate: z.iso.datetime().nullable().optional(),
  endDate: z.iso.datetime().nullable().optional(),
});
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

export const startSprintSchema = z
  .object({
    startDate: z.iso.datetime().optional(),
    endDate: z.iso.datetime().optional(),
  })
  .refine(dateRangeRefinement, dateRangeError);
export type StartSprintInput = z.infer<typeof startSprintSchema>;

export const closeSprintSchema = z.object({
  incompleteIssuesAction: incompleteIssueActionSchema,
  nextSprintId: z.guid().optional(),
});
export type CloseSprintInput = z.infer<typeof closeSprintSchema>;

export const sprintIssuesSchema = z.object({
  issueIds: uniqueUuidArray({ min: 1, max: SPRINT_ISSUES_MAX }),
});
export type SprintIssuesInput = z.infer<typeof sprintIssuesSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const sprintSchema = z.object({
  id: z.guid(),
  boardId: z.guid(),
  name: z.string(),
  goal: z.string().nullable(),
  startDate: z.iso.datetime().nullable(),
  endDate: z.iso.datetime().nullable(),
  status: sprintStatusSchema,
  ordinal: z.number().int().nonnegative(),
  totalIssues: z.number().int().nonnegative(),
  completedIssues: z.number().int().nonnegative(),
  startedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Sprint = z.infer<typeof sprintSchema>;

export const closeSprintResultSchema = z.object({
  sprint: sprintSchema,
  completedIssues: z.number().int().nonnegative(),
  incompleteIssues: z.number().int().nonnegative(),
  movedToBacklog: z.number().int().nonnegative().optional(),
  movedToSprint: z.number().int().nonnegative().optional(),
  velocityPoints: z.number().int().nonnegative(),
});
export type CloseSprintResult = z.infer<typeof closeSprintResultSchema>;

export const addSprintIssuesResultSchema = z.object({
  added: z.number().int().nonnegative(),
});
export type AddSprintIssuesResult = z.infer<typeof addSprintIssuesResultSchema>;

export const removeSprintIssuesResultSchema = z.object({
  removed: z.number().int().nonnegative(),
});
export type RemoveSprintIssuesResult = z.infer<
  typeof removeSprintIssuesResultSchema
>;

export const burndownPointSchema = z.object({
  date: z.string(),
  ideal: z.number(),
  // null on days after "today" — the actual line stops at the current date.
  actual: z.number().nullable(),
  completed: z.number(),
});
export type BurndownPoint = z.infer<typeof burndownPointSchema>;
