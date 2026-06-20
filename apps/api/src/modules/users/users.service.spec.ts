import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { InviteStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { UsersService } from "./users.service";
import { UsersRepository } from "./users.repository";
import { InvitesRepository } from "./invites.repository";
import { MailService } from "@/modules/mail/mail.service";
import { authConfig } from "@/config";
import { mockAuthConfig, buildUser, buildInvite } from "@test/helpers";

jest.mock("bcrypt");
const bcryptCompare = bcrypt.compare as jest.Mock;
const bcryptHash = bcrypt.hash as jest.Mock;

function toDomainUser(u: ReturnType<typeof buildUser>) {
  const blockedAt = u.blockedAt as Date | null;
  const deletedAt = u.deletedAt as Date | null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    isBlocked: u.isBlocked,
    blockedAt: blockedAt ? blockedAt.toISOString() : null,
    blockReason: u.blockReason,
    deletedAt: deletedAt ? deletedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

function toDomainInvite(i: ReturnType<typeof buildInvite>) {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedBy: { id: "sender-id", name: "Sender" },
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

describe("UsersService", () => {
  let service: UsersService;
  let usersRepo: Record<string, jest.Mock>;
  let invitesRepo: Record<string, jest.Mock>;
  let mail: { sendInvite: jest.Mock };

  beforeEach(async () => {
    mail = { sendInvite: jest.fn().mockResolvedValue(undefined) };
    bcryptHash.mockResolvedValue("$2b$12$hashed");

    usersRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByIdWithPasswordHash: jest.fn().mockResolvedValue(null),
      findDeletedById: jest.fn().mockResolvedValue(null),
      findPage: jest
        .fn()
        .mockResolvedValue({
          items: [],
          meta: { total: 0, page: 1, perPage: 20, totalPages: 0 },
        }),
      findMemberships: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updatePasswordHash: jest.fn().mockResolvedValue(undefined),
      block: jest.fn(),
      unblock: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn(),
      revokeAllRefreshTokensFor: jest.fn().mockResolvedValue(undefined),
    };

    invitesRepo = {
      findPendingByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      rotateToken: jest.fn(),
      setStatus: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: usersRepo },
        { provide: InvitesRepository, useValue: invitesRepo },
        { provide: MailService, useValue: mail },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe("getMe", () => {
    it("should return user", async () => {
      const user = buildUser();
      usersRepo.findById.mockResolvedValue(toDomainUser(user));

      const result = await service.getMe(user.id);

      expect(result.id).toBe(user.id);
    });

    it("should throw NotFoundError when user not found", async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.getMe("missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("changePassword", () => {
    it("should update password when current is correct", async () => {
      const user = buildUser();
      usersRepo.findByIdWithPasswordHash.mockResolvedValue({
        user: toDomainUser(user),
        passwordHash: user.passwordHash,
      });
      bcryptCompare.mockResolvedValue(true);

      await service.changePassword(user.id, {
        currentPassword: "old123456",
        newPassword: "new123456",
      });

      expect(usersRepo.updatePasswordHash).toHaveBeenCalledWith(
        user.id,
        "$2b$12$hashed",
      );
    });

    it("should throw ValidationError on wrong current password", async () => {
      const user = buildUser();
      usersRepo.findByIdWithPasswordHash.mockResolvedValue({
        user: toDomainUser(user),
        passwordHash: user.passwordHash,
      });
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.changePassword(user.id, {
          currentPassword: "wrong",
          newPassword: "new123456",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw NotFoundError when user not found", async () => {
      usersRepo.findByIdWithPasswordHash.mockResolvedValue(null);

      await expect(
        service.changePassword("missing", {
          currentPassword: "a",
          newPassword: "b",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("sendInvite", () => {
    const dto = { email: "new@test.local" } as const;

    it("should create invite and send email", async () => {
      const sender = buildUser();
      const invite = buildInvite({ email: dto.email });
      usersRepo.findByEmail.mockResolvedValue(null);
      usersRepo.findById.mockResolvedValue(toDomainUser(sender));
      invitesRepo.findPendingByEmail.mockResolvedValue(null);
      invitesRepo.create.mockResolvedValue({
        invite: {
          ...toDomainInvite(invite),
          invitedBy: { id: sender.id, name: sender.name },
        },
        token: invite.token,
      });

      const result = await service.sendInvite(sender.id, dto);

      expect(result.id).toBe(invite.id);
      expect(mail.sendInvite).toHaveBeenCalledWith(
        dto.email,
        expect.objectContaining({
          senderName: sender.name,
          token: invite.token,
        }),
      );
    });

    it("should throw ConflictError if user already exists", async () => {
      usersRepo.findByEmail.mockResolvedValue(toDomainUser(buildUser()));

      await expect(service.sendInvite("sender-id", dto)).rejects.toThrow(
        ConflictError,
      );
    });

    it("should throw ConflictError if pending invite exists", async () => {
      usersRepo.findByEmail.mockResolvedValue(null);
      invitesRepo.findPendingByEmail.mockResolvedValue({ id: "invite-id" });

      await expect(service.sendInvite("sender-id", dto)).rejects.toThrow(
        ConflictError,
      );
    });

    it("should delete the orphan invite and rethrow when sending the email fails", async () => {
      const sender = buildUser();
      const invite = buildInvite({ email: dto.email });
      usersRepo.findByEmail.mockResolvedValue(null);
      usersRepo.findById.mockResolvedValue(toDomainUser(sender));
      invitesRepo.findPendingByEmail.mockResolvedValue(null);
      invitesRepo.create.mockResolvedValue({
        invite: {
          ...toDomainInvite(invite),
          invitedBy: { id: sender.id, name: sender.name },
        },
        token: invite.token,
      });
      mail.sendInvite.mockRejectedValue(new Error("SMTP down"));

      await expect(service.sendInvite(sender.id, dto)).rejects.toThrow(
        "SMTP down",
      );
      expect(invitesRepo.delete).toHaveBeenCalledWith(invite.id);
    });
  });

  describe("resendInvite", () => {
    it("should regenerate token and resend email", async () => {
      const invite = buildInvite();
      const sender = buildUser();
      invitesRepo.findById.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        status: InviteStatus.PENDING,
      });
      usersRepo.findById.mockResolvedValue(toDomainUser(sender));
      invitesRepo.rotateToken.mockResolvedValue({
        invite: {
          ...toDomainInvite(invite),
          invitedBy: { id: sender.id, name: sender.name },
        },
        token: "new-token",
      });

      const result = await service.resendInvite(invite.id, sender.id);

      expect(result.id).toBe(invite.id);
      expect(mail.sendInvite).toHaveBeenCalled();
    });

    it("should throw NotFoundError for non-pending invite", async () => {
      invitesRepo.findById.mockResolvedValue({
        id: "invite-id",
        email: "x@y.z",
        status: InviteStatus.ACCEPTED,
      });

      await expect(service.resendInvite("invite-id", "sender")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("revokeInvite", () => {
    it("should revoke pending invite", async () => {
      const invite = buildInvite();
      invitesRepo.findById.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        status: InviteStatus.PENDING,
      });

      await service.revokeInvite(invite.id);

      expect(invitesRepo.setStatus).toHaveBeenCalledWith(
        invite.id,
        InviteStatus.REVOKED,
      );
    });

    it("should throw NotFoundError for non-pending invite", async () => {
      invitesRepo.findById.mockResolvedValue(null);

      await expect(service.revokeInvite("missing")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("blockUser", () => {
    it("should block user and revoke tokens", async () => {
      const target = buildUser();
      const blocked = toDomainUser({ ...target, isBlocked: true });
      usersRepo.findById.mockResolvedValue(toDomainUser(target));
      usersRepo.block.mockResolvedValue(blocked);

      const result = await service.blockUser(target.id, "admin-id", {
        reason: "spam",
      });

      expect(result.isBlocked).toBe(true);
      expect(usersRepo.revokeAllRefreshTokensFor).toHaveBeenCalledWith(
        target.id,
      );
    });

    it("should throw ValidationError when blocking yourself", async () => {
      await expect(service.blockUser("same-id", "same-id", {})).rejects.toThrow(
        ValidationError,
      );
    });

    it("should throw NotFoundError for missing user", async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.blockUser("target", "admin", {})).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("unblockUser", () => {
    it("should unblock user", async () => {
      const user = buildUser({ isBlocked: true });
      const unblocked = toDomainUser({ ...user, isBlocked: false });
      usersRepo.findById.mockResolvedValue(toDomainUser(user));
      usersRepo.unblock.mockResolvedValue(unblocked);

      const result = await service.unblockUser(user.id);

      expect(result.isBlocked).toBe(false);
    });
  });

  describe("softDeleteUser", () => {
    it("should soft-delete user and revoke tokens", async () => {
      const target = buildUser();
      usersRepo.findById.mockResolvedValue(toDomainUser(target));

      await service.softDeleteUser(target.id, "admin-id");

      expect(usersRepo.softDelete).toHaveBeenCalledWith(target.id, "admin-id");
      expect(usersRepo.revokeAllRefreshTokensFor).toHaveBeenCalledWith(
        target.id,
      );
    });

    it("should throw ValidationError when deleting yourself", async () => {
      await expect(
        service.softDeleteUser("same-id", "same-id"),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("restoreUser", () => {
    it("should restore soft-deleted user", async () => {
      const user = buildUser({ deletedAt: new Date() });
      usersRepo.findDeletedById.mockResolvedValue(toDomainUser(user));
      usersRepo.restore.mockResolvedValue(
        toDomainUser({ ...user, deletedAt: null }),
      );

      const result = await service.restoreUser(user.id);

      expect(result.deletedAt).toBeNull();
    });

    it("should throw ValidationError if user not deleted", async () => {
      usersRepo.findDeletedById.mockResolvedValue(null);

      await expect(service.restoreUser("not-deleted")).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("findAll", () => {
    it("should return paginated users", async () => {
      const users = [buildUser(), buildUser()];
      usersRepo.findPage.mockResolvedValue({
        items: users.map(toDomainUser),
        meta: { total: 2, page: 1, perPage: 10, totalPages: 1 },
      });

      const result = await service.findAll({ page: 1, perPage: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it("should filter by blocked status", async () => {
      await service.findAll({ page: 1, perPage: 20, status: "blocked" });

      expect(usersRepo.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "blocked" }),
      );
    });
  });
});
