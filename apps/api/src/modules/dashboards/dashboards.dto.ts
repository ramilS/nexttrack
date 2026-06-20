import { createZodDto } from 'nestjs-zod';
import {
  createDashboardSchema,
  updateDashboardSchema,
  addWidgetSchema,
  updateWidgetSchema,
  dashboardSchema,
  dashboardWidgetSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateDashboardDto extends createZodDto(createDashboardSchema) {}
export class UpdateDashboardDto extends createZodDto(updateDashboardSchema) {}
export class AddWidgetDto extends createZodDto(addWidgetSchema) {}
export class UpdateWidgetDto extends createZodDto(updateWidgetSchema) {}

export class DashboardDto extends createZodDto(dashboardSchema) {}
export class DashboardWidgetDto extends createZodDto(dashboardWidgetSchema) {}
