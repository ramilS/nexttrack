import { createZodDto } from 'nestjs-zod';
import { createApiKeySchema, apiKeySchema, issuedApiKeySchema } from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
export class ApiKeyDto extends createZodDto(apiKeySchema) {}
export class IssuedApiKeyDto extends createZodDto(issuedApiKeySchema) {}
