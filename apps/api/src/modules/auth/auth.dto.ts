import { createZodDto } from 'nestjs-zod';
import {
  loginSchema,
  acceptInviteSchema,
  authResponseSchema,
  authMethodsResponseSchema,
  inviteValidationSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class LoginDto extends createZodDto(loginSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}

export class AuthResponseDto extends createZodDto(authResponseSchema) {}
export class AuthMethodsResponseDto extends createZodDto(authMethodsResponseSchema) {}
export class InviteValidationDto extends createZodDto(inviteValidationSchema) {}
