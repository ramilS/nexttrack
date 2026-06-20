import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  // Hard cap on rows a time report may scan. Reports aggregate every matched
  // log in memory, so an unbounded date range is an OOM vector; over this the
  // request fails fast asking the caller to narrow the range (never a silent
  // partial total).
  maxReportRows: z.coerce.number().int().min(1).max(1_000_000).default(50_000),
});

export type TimeTrackingConfig = z.infer<typeof schema>;

export const timeTrackingConfig = registerAs(
  'timeTracking',
  (): TimeTrackingConfig => {
    return schema.parse({
      maxReportRows: process.env.TIME_REPORT_MAX_ROWS,
    });
  },
);
