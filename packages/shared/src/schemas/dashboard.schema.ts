import { z } from 'zod';

export const DASHBOARD_NAME_MAX = 100;
export const WIDGET_TITLE_MAX = 100;

export const WIDGET_TYPES = [
  'MY_ISSUES',
  'ASSIGNED_TO_ME',
  'RECENT_ACTIVITY',
  'PROJECT_PROGRESS',
  'SPRINT_BURNDOWN',
  'CFD_MINI',
  'VELOCITY_MINI',
  'ISSUES_BY_STATUS',
  'ISSUES_BY_PRIORITY',
  'ISSUES_BY_TYPE',
  'WATCHED_ISSUES',
  'TIME_SPENT_TODAY',
  'OVERDUE_ISSUES',
  'CUSTOM_FILTER',
] as const;
export const widgetTypeSchema = z.enum(WIDGET_TYPES);
export type WidgetType = z.infer<typeof widgetTypeSchema>;

export const widgetLayoutItemSchema = z.object({
  widgetId: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
export type WidgetLayoutItem = z.infer<typeof widgetLayoutItemSchema>;

const widgetConfigSchema = z.record(z.string(), z.unknown());

// ─── Request schemas ─────────────────────────────────────────

export const createDashboardSchema = z.object({
  name: z.string().trim().min(1).max(DASHBOARD_NAME_MAX),
  isDefault: z.boolean().default(false),
});
export type CreateDashboardInput = z.input<typeof createDashboardSchema>;
export type CreateDashboardParsed = z.infer<typeof createDashboardSchema>;

export const updateDashboardSchema = z.object({
  name: z.string().trim().min(1).max(DASHBOARD_NAME_MAX).optional(),
  layout: z.array(widgetLayoutItemSchema).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;

export const addWidgetSchema = z.object({
  type: widgetTypeSchema,
  title: z.string().trim().min(1).max(WIDGET_TITLE_MAX),
  config: widgetConfigSchema.default({}),
});
export type AddWidgetInput = z.input<typeof addWidgetSchema>;
export type AddWidgetParsed = z.infer<typeof addWidgetSchema>;

export const updateWidgetSchema = z.object({
  title: z.string().trim().min(1).max(WIDGET_TITLE_MAX).optional(),
  config: widgetConfigSchema.optional(),
});
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const dashboardWidgetSchema = z.object({
  id: z.guid(),
  type: widgetTypeSchema,
  title: z.string(),
  config: widgetConfigSchema,
});
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;

export const dashboardSchema = z.object({
  id: z.guid(),
  userId: z.guid(),
  name: z.string(),
  isDefault: z.boolean(),
  layout: z.array(widgetLayoutItemSchema),
  widgets: z.array(dashboardWidgetSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
