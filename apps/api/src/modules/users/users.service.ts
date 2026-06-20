import { Inject, Injectable } from "@nestjs/common";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { ConfigType } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { MailService } from "@/modules/mail/mail.service";
import { ErrorCode } from "@repo/shared/error-codes";
import type {
  UpdateUserInput,
  AdminUpdateUserInput,
  ChangePasswordInput,
  SendInviteInput,
  BlockUserInput,
  ListUsersQueryParsed,
  ListInvitesQuery,
  User,
  Invite,
  UserMembership,
  PaginationMeta,
  CurrentUser,
} from "@repo/shared/schemas";
import { GlobalRole, InviteStatus } from "@prisma/client";
import { UsersRepository } from "./users.repository";
import { InvitesRepository } from "./invites.repository";
import { authConfig } from "@/config";

const BCRYPT_ROUNDS = 12;

/**
 * Project the full `User` down to the self-view returned by `/users/me`.
 * Drops the admin-only moderation columns so a user's own profile never ships
 * back blockReason/isBlocked/deletedAt or internal timestamps.
 */
function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    private invitesRepo: InvitesRepository,
    private mail: MailService,
    @Inject(authConfig.KEY)
    private auth: ConfigType<typeof authConfig>,
  ) {}

  async getMe(userId: string): Promise<CurrentUser> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return toCurrentUser(user);
  }

  async updateMe(userId: string, dto: UpdateUserInput): Promise<CurrentUser> {
    return toCurrentUser(await this.usersRepo.update(userId, dto));
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordInput,
  ): Promise<void> {
    const record = await this.usersRepo.findByIdWithPasswordHash(userId);
    if (!record || !record.passwordHash) {
      throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    }

    const valid = await bcrypt.compare(
      dto.currentPassword,
      record.passwordHash,
    );
    if (!valid) {
      throw new ValidationError(
        ErrorCode.INVALID_CREDENTIALS,
        "Current password is incorrect",
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.usersRepo.updatePasswordHash(userId, passwordHash);
  }

  async findAll(
    query: ListUsersQueryParsed,
  ): Promise<{ items: User[]; meta: PaginationMeta }> {
    return this.usersRepo.findPage({
      page: query.page,
      perPage: query.perPage,
      status: query.status ?? "all",
      search: query.search,
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findById(id);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  async adminUpdateUser(
    targetId: string,
    _adminId: string,
    dto: AdminUpdateUserInput,
  ): Promise<User> {
    const user = await this.usersRepo.findById(targetId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return this.usersRepo.update(targetId, {
      name: dto.name,
      avatarUrl: dto.avatarUrl,
    });
  }

  async getUserMemberships(userId: string): Promise<UserMembership[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return this.usersRepo.findMemberships(userId);
  }

  // --- Invites ---

  async sendInvite(senderId: string, dto: SendInviteInput): Promise<Invite> {
    const existingUser = await this.usersRepo.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictError(
        ErrorCode.USER_ALREADY_EXISTS,
        "User with this email already exists",
      );
    }

    const pendingInvite = await this.invitesRepo.findPendingByEmail(dto.email);
    if (pendingInvite) {
      throw new ConflictError(
        ErrorCode.INVITE_ALREADY_SENT,
        "An active invitation has already been sent to this email",
      );
    }

    const sender = await this.usersRepo.findById(senderId);
    const ttlHours = this.auth.inviteTtlHours;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const { invite, token } = await this.invitesRepo.create({
      email: dto.email,
      role: GlobalRole.USER,
      senderId,
      expiresAt,
    });

    try {
      await this.mail.sendInvite(dto.email, {
        senderName: sender?.name || "Admin",
        token,
        ttlHours,
      });
    } catch (error) {
      // The invite row is persisted before the email is sent. If delivery
      // fails, drop it so a retry isn't blocked by a phantom INVITE_ALREADY_SENT.
      await this.invitesRepo.delete(invite.id);
      throw error;
    }

    return invite;
  }

  async resendInvite(inviteId: string, senderId: string): Promise<Invite> {
    const existing = await this.invitesRepo.findById(inviteId);
    if (!existing || existing.status !== InviteStatus.PENDING) {
      throw new NotFoundError(
        ErrorCode.INVITE_INVALID,
        "Invitation not found or not in pending status",
      );
    }

    const sender = await this.usersRepo.findById(senderId);
    const ttlHours = this.auth.inviteTtlHours;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const { invite, token } = await this.invitesRepo.rotateToken(
      inviteId,
      crypto.randomUUID(),
      expiresAt,
    );

    await this.mail.sendInvite(existing.email, {
      senderName: sender?.name || "Admin",
      token,
      ttlHours,
    });

    return invite;
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const existing = await this.invitesRepo.findById(inviteId);
    if (!existing || existing.status !== InviteStatus.PENDING) {
      throw new NotFoundError(
        ErrorCode.INVITE_INVALID,
        "Invitation not found or not in pending status",
      );
    }
    await this.invitesRepo.setStatus(inviteId, InviteStatus.REVOKED);
  }

  async findInvites(query: ListInvitesQuery): Promise<Invite[]> {
    const status = query.status
      ? (query.status.toUpperCase() as InviteStatus)
      : undefined;
    return this.invitesRepo.findAll(status);
  }

  // --- Block / Unblock ---

  async blockUser(
    targetId: string,
    adminId: string,
    dto: BlockUserInput,
  ): Promise<User> {
    if (targetId === adminId) {
      throw new ValidationError(
        ErrorCode.CANNOT_MODIFY_SELF,
        "Cannot block yourself",
      );
    }

    const user = await this.usersRepo.findById(targetId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);

    const updated = await this.usersRepo.block(targetId, {
      blockedById: adminId,
      reason: dto.reason || null,
    });

    await this.usersRepo.revokeAllRefreshTokensFor(targetId);

    return updated;
  }

  async unblockUser(targetId: string): Promise<User> {
    const user = await this.usersRepo.findById(targetId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    return this.usersRepo.unblock(targetId);
  }

  // --- Soft Delete / Restore ---

  async softDeleteUser(targetId: string, adminId: string): Promise<void> {
    if (targetId === adminId) {
      throw new ValidationError(
        ErrorCode.CANNOT_MODIFY_SELF,
        "Cannot delete yourself",
      );
    }

    const user = await this.usersRepo.findById(targetId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND);

    await this.usersRepo.softDelete(targetId, adminId);
    await this.usersRepo.revokeAllRefreshTokensFor(targetId);
  }

  async restoreUser(targetId: string): Promise<User> {
    const user = await this.usersRepo.findDeletedById(targetId);
    if (!user) {
      throw new ValidationError(
        ErrorCode.USER_NOT_DELETED,
        "User is not deleted or does not exist",
      );
    }
    return this.usersRepo.restore(targetId);
  }
}
