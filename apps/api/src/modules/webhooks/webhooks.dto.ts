import { createZodDto } from 'nestjs-zod';
import { webhookSchema, webhookTestResultSchema } from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas, rendered into the OpenAPI
 * document. The shared package stays NestJS-free — only these thin
 * classes live in the API.
 */
export class WebhookDto extends createZodDto(webhookSchema) {}
export class WebhookTestResultDto extends createZodDto(webhookTestResultSchema) {}
