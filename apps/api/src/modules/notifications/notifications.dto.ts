import { createZodDto } from 'nestjs-zod';
import {
  notificationQuerySchema,
  markReadSchema,
  updatePreferencesSchema,
  notificationPreferencesSchema,
  notificationItemSchema,
  unreadCountSchema,
  notificationChannelOptionSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class NotificationQueryDto extends createZodDto(notificationQuerySchema) {}
export class MarkReadDto extends createZodDto(markReadSchema) {}
export class UpdatePreferencesDto extends createZodDto(updatePreferencesSchema) {}

export class NotificationPreferencesDto extends createZodDto(notificationPreferencesSchema) {}

export class NotificationItemDto extends createZodDto(notificationItemSchema) {}
export class UnreadCountDto extends createZodDto(unreadCountSchema) {}
export class NotificationChannelOptionDto extends createZodDto(notificationChannelOptionSchema) {}
