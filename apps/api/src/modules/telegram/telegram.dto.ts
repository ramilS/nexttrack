import { createZodDto } from 'nestjs-zod';
import {
  createTelegramConfigSchema,
  updateTelegramConfigSchema,
  telegramConfigSchema,
  telegramTestResultSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared @repo/shared telegram schemas: validated by
 * the global AppZodValidationPipe and rendered into the OpenAPI document. The
 * schemas stay class-free in shared — only these thin classes are NestJS-aware.
 */
export class CreateTelegramConfigDto extends createZodDto(createTelegramConfigSchema) {}
export class UpdateTelegramConfigDto extends createZodDto(updateTelegramConfigSchema) {}

export class TelegramConfigDto extends createZodDto(telegramConfigSchema) {}
export class TelegramTestResultDto extends createZodDto(telegramTestResultSchema) {}
