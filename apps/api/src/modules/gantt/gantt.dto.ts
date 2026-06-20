import { createZodDto } from 'nestjs-zod';
import { ganttQuerySchema, ganttDataSchema } from '@repo/shared/schemas';

/**
 * ZodDto wrapper over the shared schema: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only this thin class lives in the API.
 */
export class GanttQueryDto extends createZodDto(ganttQuerySchema) {}
export class GanttDataDto extends createZodDto(ganttDataSchema) {}
