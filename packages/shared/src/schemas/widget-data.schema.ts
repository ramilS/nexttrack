import { z } from 'zod';

/**
 * Dashboard widget-data response payloads — one schema per WidgetType. These
 * are the single source of truth shared by the API (`WidgetDataService` builder
 * return types) and the web widget components, so a shape change on either side
 * is a compile error rather than a silent runtime drift.
 */

// ─── Shared rows ─────────────────────────────────────────────

export const widgetIssueRowSchema = z.object({
  id: z.string(),
  projectKey: z.string(),
  number: z.number(),
  title: z.string(),
  priority: z.string(),
  status: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    category: z.string(),
  }),
});
export type WidgetIssueRow = z.infer<typeof widgetIssueRowSchema>;

/** MY_ISSUES, ASSIGNED_TO_ME, WATCHED_ISSUES, CUSTOM_FILTER */
export const issueListWidgetSchema = z.object({
  items: z.array(widgetIssueRowSchema),
});
export type IssueListWidgetData = z.infer<typeof issueListWidgetSchema>;

// ─── OVERDUE_ISSUES ──────────────────────────────────────────

export const overdueIssueRowSchema = z.object({
  id: z.string(),
  projectKey: z.string(),
  number: z.number(),
  title: z.string(),
  priority: z.string(),
  dueDate: z.string(),
});
export const overdueIssuesWidgetSchema = z.object({
  items: z.array(overdueIssueRowSchema),
});
export type OverdueIssuesWidgetData = z.infer<typeof overdueIssuesWidgetSchema>;

// ─── RECENT_ACTIVITY ─────────────────────────────────────────

export const widgetActivityRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  actor: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export const recentActivityWidgetSchema = z.object({
  items: z.array(widgetActivityRowSchema),
});
export type RecentActivityWidgetData = z.infer<typeof recentActivityWidgetSchema>;

// ─── PROJECT_PROGRESS ────────────────────────────────────────

export const projectProgressRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string(),
  openIssueCount: z.number(),
  totalIssueCount: z.number(),
  progress: z.number(),
});
export const projectProgressWidgetSchema = z.object({
  items: z.array(projectProgressRowSchema),
});
export type ProjectProgressWidgetData = z.infer<typeof projectProgressWidgetSchema>;

// ─── TIME_SPENT_TODAY ────────────────────────────────────────

export const timeSpentEntrySchema = z.object({
  issueKey: z.string(),
  title: z.string(),
  minutes: z.number(),
});
export const timeSpentTodayWidgetSchema = z.object({
  totalMinutes: z.number(),
  entries: z.array(timeSpentEntrySchema),
});
export type TimeSpentTodayWidgetData = z.infer<typeof timeSpentTodayWidgetSchema>;

// ─── ISSUES_BY_STATUS ────────────────────────────────────────

export const statusCountSchema = z.object({
  name: z.string(),
  color: z.string(),
  count: z.number(),
});
export const issuesByStatusWidgetSchema = z.object({
  items: z.array(statusCountSchema),
});
export type IssuesByStatusWidgetData = z.infer<typeof issuesByStatusWidgetSchema>;

// ─── ISSUES_BY_PRIORITY / ISSUES_BY_TYPE ─────────────────────

export const labelCountSchema = z.object({
  name: z.string(),
  count: z.number(),
});
export const labelCountWidgetSchema = z.object({
  items: z.array(labelCountSchema),
});
export type LabelCountWidgetData = z.infer<typeof labelCountWidgetSchema>;

// ─── SPRINT_BURNDOWN (mini) ──────────────────────────────────

export const widgetBurndownPointSchema = z.object({
  date: z.string(),
  ideal: z.number(),
  actual: z.number(),
});
export const sprintBurndownWidgetSchema = z.object({
  points: z.array(widgetBurndownPointSchema),
  sprintName: z.string().nullable(),
});
export type SprintBurndownWidgetData = z.infer<typeof sprintBurndownWidgetSchema>;

// ─── CFD_MINI ────────────────────────────────────────────────

export const cfdSeriesSchema = z.object({
  statusName: z.string(),
  color: z.string(),
  counts: z.array(z.number()),
});
export const cfdMiniWidgetSchema = z.object({
  dates: z.array(z.string()),
  series: z.array(cfdSeriesSchema),
});
export type CfdMiniWidgetData = z.infer<typeof cfdMiniWidgetSchema>;

// ─── VELOCITY_MINI ───────────────────────────────────────────

export const velocityMiniSprintSchema = z.object({
  name: z.string(),
  planned: z.number(),
  completed: z.number(),
});
export const velocityMiniWidgetSchema = z.object({
  sprints: z.array(velocityMiniSprintSchema),
  averageVelocity: z.number(),
});
export type VelocityMiniWidgetData = z.infer<typeof velocityMiniWidgetSchema>;
