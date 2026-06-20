import { z } from 'zod';
import { userSummarySchema } from './common.schema';
import { tagSchema } from './tag.schema';
import { issueTypeSchema, issuePrioritySchema } from './issue.schema';
import { sprintSchema } from './sprint.schema';
import { workflowStatusCategorySchema } from './workflow.schema';

export const BOARD_NAME_MAX = 100;
export const BOARD_COLUMN_NAME_MAX = 100;
export const BOARD_FILTER_QUERY_MAX = 1000;
export const BOARD_WIP_MIN = 0;
export const BOARD_WIP_MAX = 1000;
export const BOARD_ORDINAL_MIN = 0;
export const BOARD_ORDINAL_MAX = 1000;

export const BOARD_TYPES = ['KANBAN', 'SCRUM'] as const;
export const boardTypeSchema = z.enum(BOARD_TYPES);
export type BoardType = z.infer<typeof boardTypeSchema>;

export const SWIMLANE_BY_VALUES = ['NONE', 'ASSIGNEE', 'EPIC', 'PRIORITY', 'TYPE'] as const;
export const swimlaneBySchema = z.enum(SWIMLANE_BY_VALUES);
export type SwimlaneBy = z.infer<typeof swimlaneBySchema>;

// ─── Request schemas ─────────────────────────────────────────

export const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(BOARD_NAME_MAX),
  type: boardTypeSchema.default('KANBAN'),
  swimlaneBy: swimlaneBySchema.optional(),
  filterQuery: z.string().max(BOARD_FILTER_QUERY_MAX).optional(),
  autoCloseOnDone: z.boolean().optional(),
});
export type CreateBoardInput = z.input<typeof createBoardSchema>;
export type CreateBoardParsed = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = z.object({
  name: z.string().trim().min(1).max(BOARD_NAME_MAX).optional(),
  swimlaneBy: swimlaneBySchema.optional(),
  filterQuery: z.string().max(BOARD_FILTER_QUERY_MAX).nullable().optional(),
  autoCloseOnDone: z.boolean().optional(),
});
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

export const boardColumnSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(BOARD_COLUMN_NAME_MAX),
  statusIds: z.array(z.string()).min(1),
  color: z.string().optional(),
  wipLimit: z.number().int().min(BOARD_WIP_MIN).max(BOARD_WIP_MAX).optional(),
  ordinal: z.number().int().min(BOARD_ORDINAL_MIN).max(BOARD_ORDINAL_MAX),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const updateColumnsSchema = z
  .object({
    columns: z.array(boardColumnSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const col of data.columns) {
      for (const statusId of col.statusIds) {
        if (seen.has(statusId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Status ${statusId} is assigned to more than one column`,
            path: ['columns'],
          });
        }
        seen.add(statusId);
      }
    }
  });
export type UpdateColumnsInput = z.infer<typeof updateColumnsSchema>;

export const moveIssueSchema = z.object({
  issueId: z.guid(),
  toStatusId: z.string().optional(),
  toSprintId: z.guid().nullable().optional(),
  toParentId: z.guid().nullable().optional(),
  afterIssueId: z.guid().nullable().optional(),
});
export type MoveIssueInput = z.infer<typeof moveIssueSchema>;

export const boardQuerySchema = z.object({
  sprintId: z.guid().optional(),
  swimlaneBy: swimlaneBySchema.optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

export const boardSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  type: boardTypeSchema,
  columns: z.array(boardColumnSchema),
  swimlaneBy: swimlaneBySchema,
  filterQuery: z.string().nullable(),
  autoCloseOnDone: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Board = z.infer<typeof boardSchema>;

/**
 * An issue rendered as a card on a board or in a backlog. Subset of full
 * `Issue` — only fields the card UI needs. Backend builds this via
 * `toBoardIssueCard`. Used by board data, backlog, and sprint detail.
 */
export const boardIssueCardSchema = z.object({
  id: z.guid(),
  number: z.number().int(),
  title: z.string(),
  descriptionPreview: z.string().nullable(),
  type: issueTypeSchema,
  priority: issuePrioritySchema,
  statusId: z.guid(),
  projectId: z.guid(),
  assigneeId: z.guid().nullable(),
  parentId: z.guid().nullable(),
  assignee: userSummarySchema.nullable(),
  tags: z.array(tagSchema),
  estimate: z.number().int().nullable(),
  spent: z.number().int(),
  dueDate: z.iso.datetime().nullable(),
  isOverdue: z.boolean(),
  commentsCount: z.number().int().nonnegative(),
  hasAttachments: z.boolean(),
  childrenCount: z.number().int().nonnegative(),
  completedChildrenCount: z.number().int().nonnegative(),
  sprintId: z.guid().nullable(),
});
export type BoardIssueCard = z.infer<typeof boardIssueCardSchema>;

/** One column's worth of issues on a board. */
export const boardColumnDataSchema = z.object({
  column: boardColumnSchema,
  issues: z.array(boardIssueCardSchema),
  totalCount: z.number().int().nonnegative(),
  isOverWip: z.boolean(),
});
export type BoardColumnData = z.infer<typeof boardColumnDataSchema>;

/** One row in a swimlaned board view. */
export const boardSwimlaneDataSchema = z.object({
  groupKey: z.string(),
  groupLabel: z.string(),
  /** Populated only for EPIC swimlanes (Story/Epic issue number). */
  issueNumber: z.number().int().optional(),
  columns: z.array(boardColumnDataSchema),
});
export type BoardSwimlaneData = z.infer<typeof boardSwimlaneDataSchema>;

/** Full board view: board + active sprint (scrum) + column/swimlane buckets. */
export const boardDataSchema = z.object({
  board: boardSchema,
  sprint: sprintSchema.nullable(),
  columns: z.array(boardColumnDataSchema),
  swimlanes: z.array(boardSwimlaneDataSchema),
});
export type BoardData = z.infer<typeof boardDataSchema>;

/** Cumulative flow diagram: one count series per workflow status over `dates`. */
export const cfdResponseSchema = z.object({
  dates: z.array(z.string()),
  series: z.array(
    z.object({
      statusId: z.guid(),
      statusName: z.string(),
      color: z.string(),
      category: workflowStatusCategorySchema,
      counts: z.array(z.number().int().nonnegative()),
    }),
  ),
});
export type CfdResponse = z.infer<typeof cfdResponseSchema>;

/** Velocity chart: planned vs completed estimate points per closed sprint. */
export const velocityResponseSchema = z.object({
  sprints: z.array(
    z.object({
      id: z.guid(),
      name: z.string(),
      startDate: z.iso.datetime().nullable(),
      endDate: z.iso.datetime().nullable(),
      planned: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
    }),
  ),
  averageVelocity: z.number().int().nonnegative(),
});
export type VelocityResponse = z.infer<typeof velocityResponseSchema>;

/**
 * A sprint enriched with its issue cards and progress counts, as returned in
 * the backlog view's `sprints` array. Mirrors the web `SprintWithIssues` type.
 */
export const sprintWithIssuesSchema = sprintSchema.extend({
  issues: z.array(boardIssueCardSchema),
  totalCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  progress: z.number(),
});
export type SprintWithIssues = z.infer<typeof sprintWithIssuesSchema>;

/**
 * Backlog view payload: the board's open sprints (each with their cards) plus
 * the unassigned backlog issues. Mirrors the web `BacklogResponse` type.
 */
export const backlogResponseSchema = z.object({
  sprints: z.array(sprintWithIssuesSchema),
  backlog: z.object({
    issues: z.array(boardIssueCardSchema),
  }),
});
export type BacklogResponse = z.infer<typeof backlogResponseSchema>;

/**
 * Result of moving an issue on a board: the updated card plus the activity
 * log entries the move produced (status/sprint/parent changes). `type` is a
 * Prisma ActivityType value (kept as a string here — shared stays Prisma-free).
 */
export const boardMoveResultSchema = z.object({
  issue: boardIssueCardSchema,
  activities: z.array(
    z.object({
      type: z.string(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
});
export type BoardMoveResult = z.infer<typeof boardMoveResultSchema>;
