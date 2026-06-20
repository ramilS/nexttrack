import { z } from 'zod';
import { issueStatusSchema } from './issue.schema';

/** How Gantt rows are grouped. Uppercase to match the app's enum convention
 *  (and the values the web already sends). */
export const GANTT_GROUP_BY = ['NONE', 'ASSIGNEE', 'TYPE', 'SPRINT'] as const;
export const ganttGroupBySchema = z.enum(GANTT_GROUP_BY);
export type GanttGroupBy = z.infer<typeof ganttGroupBySchema>;

export const ganttQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  groupBy: ganttGroupBySchema.default('NONE'),
  sprintId: z.guid().optional(),
  assigneeId: z.guid().optional(),
});
export type GanttQueryInput = z.infer<typeof ganttQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

/** One bar on the Gantt chart. startDate/dueDate are date-only (YYYY-MM-DD). */
export const ganttItemSchema = z.object({
  id: z.guid(),
  issueNumber: z.number().int(),
  key: z.string(),
  title: z.string(),
  type: z.string(),
  priority: z.string(),
  status: issueStatusSchema,
  assignee: z
    .object({
      id: z.guid(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
    })
    .optional(),
  parentId: z.guid().nullable(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  estimate: z.number().int().nullable(),
  progress: z.number(),
  sprintId: z.guid().nullable(),
  sprintName: z.string().nullable(),
  dependencies: z.array(z.string()),
  children: z.array(z.string()),
});
export type GanttItem = z.infer<typeof ganttItemSchema>;

export const ganttGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  items: z.array(z.string()),
});
export type GanttGroup = z.infer<typeof ganttGroupSchema>;

/** `groups` is omitted when groupBy is NONE. */
export const ganttDataSchema = z.object({
  items: z.array(ganttItemSchema),
  groups: z.array(ganttGroupSchema).optional(),
});
export type GanttData = z.infer<typeof ganttDataSchema>;
