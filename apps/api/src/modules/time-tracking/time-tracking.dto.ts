import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  startTimerSchema,
  stopTimerSchema,
  updateTimerSchema,
  createTimeLogSchema,
  updateTimeLogSchema,
  timeReportQuerySchema,
  timeReportQueryBaseSchema,
  timeLogSchema,
  timeReportResponseSchema,
  userTimeReportResponseSchema,
  activeTimerSchema,
} from '@repo/shared/schemas';
import { cursorQuerySchema } from '@/common/dto/cursor-query.dto';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class StartTimerDto extends createZodDto(startTimerSchema) {}
export class StopTimerDto extends createZodDto(stopTimerSchema) {}
export class UpdateTimerDto extends createZodDto(updateTimerSchema) {}
export class CreateTimeLogDto extends createZodDto(createTimeLogSchema) {}
export class UpdateTimeLogDto extends createZodDto(updateTimeLogSchema) {}
export class TimeReportQueryDto extends createZodDto(timeReportQuerySchema) {}

export class TimeLogDto extends createZodDto(timeLogSchema) {}

const timeLogsQuerySchema = cursorQuerySchema.extend({
  userId: z.guid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export class TimeLogsQueryDto extends createZodDto(timeLogsQuerySchema) {}

const timeReportExportQuerySchema = timeReportQueryBaseSchema
  .extend({
    format: z.enum(['csv', 'json']).default('csv'),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'dateFrom must be before or equal to dateTo',
    path: ['dateTo'],
  });

export class TimeReportExportQueryDto extends createZodDto(timeReportExportQuerySchema) {}

const userTimeReportQuerySchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  projectId: z.guid().optional(),
});

export class UserTimeReportQueryDto extends createZodDto(userTimeReportQuerySchema) {}

export class TimeReportResponseDto extends createZodDto(timeReportResponseSchema) {}
export class UserTimeReportResponseDto extends createZodDto(userTimeReportResponseSchema) {}

export class ActiveTimerDto extends createZodDto(activeTimerSchema) {}
