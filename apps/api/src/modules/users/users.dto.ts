import { createZodDto } from 'nestjs-zod';
import {
  updateUserSchema,
  adminUpdateUserSchema,
  changePasswordSchema,
  sendInviteSchema,
  blockUserSchema,
  listUsersQuerySchema,
  listInvitesQuerySchema,
  userSchema,
  currentUserSchema,
  inviteSchema,
  userMembershipSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class SendInviteDto extends createZodDto(sendInviteSchema) {}
export class BlockUserDto extends createZodDto(blockUserSchema) {}
export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
export class ListInvitesQueryDto extends createZodDto(listInvitesQuerySchema) {}

export class UserDto extends createZodDto(userSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class InviteDto extends createZodDto(inviteSchema) {}
export class UserMembershipDto extends createZodDto(userMembershipSchema) {}
