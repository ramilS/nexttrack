import { Injectable } from '@nestjs/common';
import { GlobalRole, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  User,
  UserMembership,
  PaginationMeta,
} from '@repo/shared/schemas';

export interface UserPublicRef {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface UserNameRef {
  id: string;
  name: string;
}

export interface UserListFilters {
  page: number;
  perPage: number;
  status: 'active' | 'blocked' | 'deleted' | 'all';
  search?: string;
}

export interface UserUpdatePatch {
  name?: string;
  avatarUrl?: string | null;
}

export interface UserBlockInput {
  blockedById: string;
  reason: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: GlobalRole;
  isBlocked: boolean;
  blockedAt: Date | null;
  blockReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    isBlocked: row.isBlocked,
    blockedAt: row.blockedAt?.toISOString() ?? null,
    blockReason: row.blockReason,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const MEMBERSHIP_INCLUDE = {
  project: { select: { id: true, key: true, name: true, color: true } },
  roleRef: { select: { id: true, name: true, permissions: true } },
} as const;

type MembershipRow = Prisma.ProjectMemberGetPayload<{
  include: typeof MEMBERSHIP_INCLUDE;
}>;

function toMembership(m: MembershipRow): UserMembership {
  return {
    project: {
      id: m.project.id,
      key: m.project.key,
      name: m.project.name,
      color: m.project.color ?? '#6366f1',
    },
    role: {
      id: m.roleRef.id,
      name: m.roleRef.name,
      permissions: Array.isArray(m.roleRef.permissions)
        ? (m.roleRef.permissions as string[])
        : [],
    },
    joinedAt: m.joinedAt.toISOString(),
  };
}

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  // ─── Cross-module lookups ───────────────────────────────────

  async findPublicRefsByIds(ids: string[]): Promise<UserPublicRef[]> {
    if (ids.length === 0) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  }

  async findNameRefsByIds(ids: string[]): Promise<UserNameRef[]> {
    if (ids.length === 0) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
  }

  async findActiveIdsByIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids }, isBlocked: false, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async existsActiveById(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isBlocked: false },
      select: { id: true },
    });
    return row !== null;
  }

  async findRoleById(userId: string): Promise<GlobalRole | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return row?.role ?? null;
  }

  // ─── Self / by-id reads ─────────────────────────────────────

  async findById(userId: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { id: userId } });
    return row ? toUser(row) : null;
  }

  /** Like findById, but also returns the bcrypt hash for password-change flows. */
  async findByIdWithPasswordHash(
    userId: string,
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!row) return null;
    return { user: toUser(row), passwordHash: row.passwordHash };
  }

  async findDeletedById(userId: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: { not: null } },
    });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { email } });
    return row ? toUser(row) : null;
  }

  async findActiveForJwt(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    role: GlobalRole;
    avatarUrl: string | null;
    isBlocked: boolean;
  } | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isBlocked: true,
      },
    });
  }

  async findEmailAndNameById(
    userId: string,
  ): Promise<{ email: string; name: string } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
  }

  async findHasPasswordById(userId: string): Promise<boolean | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { hasPassword: true },
    });
    return row?.hasPassword ?? null;
  }

  async findByEmailWithPasswordHash(
    email: string,
  ): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = await this.prisma.user.findFirst({ where: { email } });
    if (!row) return null;
    return { user: toUser(row), passwordHash: row.passwordHash };
  }

  // ─── Admin list ────────────────────────────────────────────

  async findPage(
    filters: UserListFilters,
  ): Promise<{ items: User[]; meta: PaginationMeta }> {
    const where: Prisma.UserWhereInput = {};

    if (filters.status === 'active') {
      where.isBlocked = false;
      where.deletedAt = null;
    } else if (filters.status === 'blocked') {
      where.isBlocked = true;
      where.deletedAt = null;
    } else if (filters.status === 'deleted') {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const skip = (filters.page - 1) * filters.perPage;
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: filters.perPage,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map(toUser),
      meta: {
        total,
        page: filters.page,
        perPage: filters.perPage,
        totalPages: Math.ceil(total / filters.perPage),
      },
    };
  }

  // ─── Updates ───────────────────────────────────────────────

  async update(userId: string, patch: UserUpdatePatch): Promise<User> {
    const data: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.avatarUrl !== undefined) data.avatarUrl = patch.avatarUrl;
    const row = await this.prisma.user.update({ where: { id: userId }, data });
    return toUser(row);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async block(userId: string, input: UserBlockInput): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
        blockedAt: new Date(),
        blockedById: input.blockedById,
        blockReason: input.reason,
      },
    });
    return toUser(row);
  }

  async unblock(userId: string): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: false,
        blockedAt: null,
        blockedById: null,
        blockReason: null,
      },
    });
    return toUser(row);
  }

  async softDelete(userId: string, deletedById: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), deletedById },
    });
  }

  async restore(userId: string): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null, deletedById: null },
    });
    return toUser(row);
  }

  // ─── Memberships ───────────────────────────────────────────

  async findMemberships(userId: string): Promise<UserMembership[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: { joinedAt: 'desc' },
    });
    return rows.map(toMembership);
  }

  // ─── Refresh tokens (temporary; moves to RefreshTokensRepository with auth) ──

  async revokeAllRefreshTokensFor(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
