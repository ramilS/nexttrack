import { z } from 'zod';

// Cap one log at ~a year of minutes so a value (or the summed `spent` Int
// column) can't overflow Postgres Int32 → 500. Re-checked in parseDuration.
export const TIME_LOG_DURATION_MAX_MINUTES = 60 * 24 * 366;

// Accept an ISO date (YYYY-MM-DD) or full date-time — a bare `.datetime()`
// would reject the date-only form the UI sends. The future-date business rule
// stays in TimeLogsService.parseDate.
export const timeLogDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/,
    'Must be an ISO date (YYYY-MM-DD) or date-time',
  );

// Duration accepts either pre-parsed minutes or a human string ("2h 30m"),
// resolved server-side by parseDuration.
const durationSchema = z.union([
  z.number().int().min(1).max(TIME_LOG_DURATION_MAX_MINUTES),
  z.string().min(1).max(50),
]);

// ─── Time logs ───────────────────────────────────────────────

export const createTimeLogSchema = z.object({
  duration: durationSchema,
  date: timeLogDateSchema.optional(),
  description: z.string().max(1000).optional(),
});
export type CreateTimeLogInput = z.infer<typeof createTimeLogSchema>;

export const updateTimeLogSchema = z.object({
  duration: durationSchema.optional(),
  date: timeLogDateSchema.optional(),
  description: z.string().max(1000).nullable().optional(),
});
export type UpdateTimeLogInput = z.infer<typeof updateTimeLogSchema>;

// Response — the API flattens the logging user onto the row (the client never
// needs the user's email). `source` distinguishes manual entries from
// timer-stopped ones.
export const timeLogSourceSchema = z.enum(['MANUAL', 'TIMER', 'IMPORT']);
export type TimeLogSource = z.infer<typeof timeLogSourceSchema>;

export const timeLogSchema = z.object({
  id: z.guid(),
  issueId: z.guid(),
  userId: z.guid(),
  userName: z.string(),
  userAvatarUrl: z.string().nullable(),
  duration: z.number().int(),
  durationFormatted: z.string(),
  date: z.string(),
  description: z.string().nullable(),
  source: timeLogSourceSchema,
  createdAt: z.string(),
});
export type TimeLog = z.infer<typeof timeLogSchema>;

// ─── Timer ───────────────────────────────────────────────────

export const startTimerSchema = z.object({
  issueId: z.guid(),
  description: z.string().max(1000).optional(),
});
export type StartTimerInput = z.infer<typeof startTimerSchema>;

export const stopTimerSchema = z.object({
  description: z.string().max(1000).optional(),
});
export type StopTimerInput = z.infer<typeof stopTimerSchema>;

export const updateTimerSchema = z.object({
  description: z.string().max(1000),
});
export type UpdateTimerInput = z.infer<typeof updateTimerSchema>;

// Response — the running timer plus its issue display context. `startedAt` is
// already an ISO string (it lives in Redis as a string); `issue` is null when
// the referenced issue no longer exists.
export const activeTimerIssueSchema = z.object({
  id: z.guid(),
  number: z.number().int(),
  title: z.string(),
  projectKey: z.string(),
});

export const activeTimerSchema = z.object({
  issueId: z.guid(),
  issue: activeTimerIssueSchema.nullable(),
  startedAt: z.iso.datetime(),
  elapsed: z.number().int().nonnegative(),
  description: z.string().nullable(),
});
export type ActiveTimer = z.infer<typeof activeTimerSchema>;

// ─── Reports ─────────────────────────────────────────────────

export const REPORT_GROUP_BY = ['USER', 'ISSUE', 'DATE', 'USER_ISSUE'] as const;
export const reportGroupBySchema = z.enum(REPORT_GROUP_BY);
export type ReportGroupBy = z.infer<typeof reportGroupBySchema>;

export const timeReportQueryBaseSchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  userIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  issueIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  groupBy: reportGroupBySchema.default('USER'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

export const timeReportQuerySchema = timeReportQueryBaseSchema.refine(
  (data) => data.dateFrom <= data.dateTo,
  { message: 'dateFrom must be before or equal to dateTo', path: ['dateTo'] },
);
export type TimeReportQueryInput = z.infer<typeof timeReportQuerySchema>;

// ─── Report response schemas ─────────────────────────────────

/** Recursive aggregation node: a group with an optional nested breakdown. */
export interface TimeReportGroup {
  key: string;
  label: string;
  duration: number;
  durationFormatted: string;
  subGroups?: TimeReportGroup[];
}

export const timeReportGroupSchema: z.ZodType<TimeReportGroup> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    duration: z.number().int().nonnegative(),
    durationFormatted: z.string(),
    subGroups: z.array(timeReportGroupSchema).optional(),
  }),
);

export const timeReportResponseSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  totalDuration: z.number().int().nonnegative(),
  totalDurationFormatted: z.string(),
  groups: z.array(timeReportGroupSchema),
  summary: z.object({
    usersCount: z.number().int().nonnegative(),
    issuesCount: z.number().int().nonnegative(),
    logsCount: z.number().int().nonnegative(),
  }),
});
export type TimeReportResponse = z.infer<typeof timeReportResponseSchema>;

const userTimeReportIssueSchema = z.object({
  id: z.guid(),
  number: z.number().int(),
  title: z.string(),
  projectKey: z.string(),
  projectName: z.string(),
});

export const userTimeLogSchema = z.object({
  id: z.guid(),
  issueId: z.guid(),
  issue: userTimeReportIssueSchema,
  duration: z.number().int(),
  durationFormatted: z.string(),
  date: z.string(),
  description: z.string().nullable(),
  source: timeLogSourceSchema,
  createdAt: z.string(),
});

export const userTimeReportResponseSchema = z.object({
  totalDuration: z.number().int().nonnegative(),
  totalDurationFormatted: z.string(),
  logs: z.array(userTimeLogSchema),
});
export type UserTimeReportResponse = z.infer<typeof userTimeReportResponseSchema>;
