import { createZodDto } from 'nestjs-zod';
import { downloadQuerySchema, attachmentSchema } from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class DownloadQueryDto extends createZodDto(downloadQuerySchema) {}

export class AttachmentDto extends createZodDto(attachmentSchema) {}
