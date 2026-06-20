import { Injectable } from '@nestjs/common';
import { GlobalRole, InviteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Invite } from '@repo/shared/schemas';

const INVITE_INCLUDE = {
  sender: { select: { id: true, name: true } },
} as const;

type InviteRow = Prisma.InviteGetPayload<{ include: typeof INVITE_INCLUDE }>;

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedBy: row.sender ? { id: row.sender.id, name: row.sender.name } : null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface InviteCreateInput {
  email: string;
  role: GlobalRole;
  senderId: string;
  expiresAt: Date;
}

export interface InviteToken {
  email: string;
  token: string;
}

@Injectable()
export class InvitesRepository {
  constructor(private prisma: PrismaService) {}

  async findPendingByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.invite.findFirst({
      where: {
        email,
        status: InviteStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  /** Full pending invite record by email (used by SSO INVITE_ONLY provisioning). */
  async findFullPendingByEmail(email: string): Promise<{
    id: string;
    email: string;
    role: GlobalRole;
    status: InviteStatus;
    expiresAt: Date;
  } | null> {
    return this.prisma.invite.findFirst({
      where: {
        email,
        status: InviteStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, role: true, status: true, expiresAt: true },
    });
  }

  async findById(inviteId: string): Promise<{
    id: string;
    email: string;
    status: InviteStatus;
  } | null> {
    const row = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      select: { id: true, email: true, status: true },
    });
    return row;
  }

  /** Full invite record needed by the auth-accept flow. */
  async findByToken(token: string): Promise<{
    id: string;
    email: string;
    role: GlobalRole;
    status: InviteStatus;
    expiresAt: Date;
    inviterName: string;
  } | null> {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        sender: { select: { name: true } },
      },
    });
    if (!invite) return null;
    const { sender, ...rest } = invite;
    return { ...rest, inviterName: sender.name };
  }

  /**
   * Atomically create a new user and mark the invite as accepted.
   * Used by the auth `acceptInvite` flow — combines user creation with
   * invite-state update so a half-applied accept can't leave a dangling
   * PENDING invite.
   */
  async acceptAtomic(
    inviteId: string,
    user: {
      email: string;
      name: string;
      passwordHash: string;
      role: GlobalRole;
    },
  ): Promise<{
    id: string;
    name: string;
    email: string;
    role: GlobalRole;
    avatarUrl: string | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          hasPassword: true,
          role: user.role,
        },
        select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      });

      await tx.invite.update({
        where: { id: inviteId },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedBy: newUser.id,
        },
      });

      return newUser;
    });
  }

  async setExpired(inviteId: string): Promise<void> {
    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.EXPIRED },
    });
  }

  async create(
    input: InviteCreateInput,
  ): Promise<{ invite: Invite; token: string }> {
    const row = await this.prisma.invite.create({
      data: {
        email: input.email,
        role: input.role,
        senderId: input.senderId,
        expiresAt: input.expiresAt,
      },
      include: INVITE_INCLUDE,
    });
    return { invite: toInvite(row), token: row.token };
  }

  async rotateToken(
    inviteId: string,
    newToken: string,
    expiresAt: Date,
  ): Promise<{ invite: Invite; token: string }> {
    const row = await this.prisma.invite.update({
      where: { id: inviteId },
      data: { token: newToken, expiresAt },
      include: INVITE_INCLUDE,
    });
    return { invite: toInvite(row), token: row.token };
  }

  async delete(inviteId: string): Promise<void> {
    await this.prisma.invite.delete({ where: { id: inviteId } });
  }

  async setStatus(inviteId: string, status: InviteStatus): Promise<void> {
    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status },
    });
  }

  async findAll(status?: InviteStatus): Promise<Invite[]> {
    const where: Prisma.InviteWhereInput = status ? { status } : {};
    const rows = await this.prisma.invite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: INVITE_INCLUDE,
    });
    return rows.map(toInvite);
  }
}
