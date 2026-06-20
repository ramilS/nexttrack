import { createZodDto } from 'nestjs-zod';
import {
  ssoFinalizeSchema,
  ssoConnectSchema,
  ssoAuthorizeQuerySchema,
  ssoCallbackQuerySchema,
  createSsoProviderSchema,
  updateSsoProviderSchema,
  ssoProviderSchema,
  publicSsoProviderSchema,
  ssoProviderConnectionSchema,
  userSsoConnectionSchema,
  ssoConnectResponseSchema,
  authResponseSchema,
} from '@repo/shared/schemas';
import { paginationQuerySchema } from '@/common/dto/pagination-query.dto';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class SsoFinalizeDto extends createZodDto(ssoFinalizeSchema) {}
export class SsoConnectDto extends createZodDto(ssoConnectSchema) {}
export class SsoAuthorizeQueryDto extends createZodDto(ssoAuthorizeQuerySchema) {}
export class SsoCallbackQueryDto extends createZodDto(ssoCallbackQuerySchema) {}
export class CreateSsoProviderDto extends createZodDto(createSsoProviderSchema) {}
export class UpdateSsoProviderDto extends createZodDto(updateSsoProviderSchema) {}
export class SsoConnectionsQueryDto extends createZodDto(paginationQuerySchema) {}

export class SsoProviderDto extends createZodDto(ssoProviderSchema) {}
export class PublicSsoProviderDto extends createZodDto(publicSsoProviderSchema) {}
export class SsoProviderConnectionDto extends createZodDto(ssoProviderConnectionSchema) {}
export class UserSsoConnectionDto extends createZodDto(userSsoConnectionSchema) {}

// finalize returns { user } identical to login (tokens go to cookies).
export class SsoFinalizeResponseDto extends createZodDto(authResponseSchema) {}
export class SsoConnectResponseDto extends createZodDto(ssoConnectResponseSchema) {}
