import { Injectable } from '@nestjs/common';
import {
  GlobalRole,
  InviteStatus,
  Prisma,
  SsoProvider as PrismaSsoProvider,
  SsoProviderType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  SsoProvider,
  SsoProviderConnection,
  PublicSsoProvider,
  UserSsoConnection,
  PaginationMeta,
} from '@repo/shared/schemas';
import { SSO_CLIENT_SECRET_MASK } from '@repo/shared/schemas';

const PROVIDER_COUNT_INCLUDE = {
  _count: { select: { connections: true } },
} as const;

type ProviderRowWithCount = Prisma.SsoProviderGetPayload<{
  include: typeof PROVIDER_COUNT_INCLUDE;
}>;

function toSsoProvider(row: ProviderRowWithCount): SsoProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isEnabled: row.isEnabled,
    clientId: row.clientId,
    clientSecret: SSO_CLIENT_SECRET_MASK,
    allowedDomain: row.allowedDomain,
    provisioningPolicy: row.provisioningPolicy,
    defaultRole: row.defaultRole,
    attributeMapping:
      (row.attributeMapping as Record<string, string> | null) ?? null,
    connectionsCount: row._count.connections,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PROVIDER_CONNECTION_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

type ProviderConnectionRow = Prisma.SsoConnectionGetPayload<{
  include: typeof PROVIDER_CONNECTION_INCLUDE;
}>;

function toProviderConnection(row: ProviderConnectionRow): SsoProviderConnection {
  return {
    id: row.id,
    externalId: row.externalId,
    email: row.email,
    user: row.user,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

const USER_CONNECTION_INCLUDE = {
  provider: { select: { id: true, name: true, type: true } },
} as const;

type UserConnectionRow = Prisma.SsoConnectionGetPayload<{
  include: typeof USER_CONNECTION_INCLUDE;
}>;

function toUserSsoConnection(row: UserConnectionRow): UserSsoConnection {
  return {
    id: row.id,
    externalId: row.externalId,
    email: row.email,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

// Provider fields the SSO auth flow needs (includes the secret, unlike the
// public DTO). Keeps the Prisma model type out of the service.
export type SsoProviderRaw = Pick<
  PrismaSsoProvider,
  | 'id'
  | 'type'
  | 'clientId'
  | 'clientSecret'
  | 'isEnabled'
  | 'allowedDomain'
  | 'defaultRole'
  | 'provisioningPolicy'
>;

export interface ProviderCreateInput {
  name: string;
  type: SsoProviderType;
  clientId: string;
  clientSecret: string;
  allowedDomain: string;
  provisioningPolicy: 'AUTO_PROVISION' | 'INVITE_ONLY';
  defaultRole: GlobalRole;
  attributeMapping?: Record<string, string> | null;
  createdById: string;
}

export interface ProviderPatch {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  allowedDomain?: string;
  provisioningPolicy?: 'AUTO_PROVISION' | 'INVITE_ONLY';
  defaultRole?: GlobalRole;
  attributeMapping?: Record<string, string> | null;
}

@Injectable()
export class SsoRepository {
  constructor(private prisma: PrismaService) {}

  // ─── SsoProvider CRUD (admin) ──────────────────────────────

  async createProvider(input: ProviderCreateInput): Promise<SsoProvider> {
    const row = await this.prisma.ssoProvider.create({
      data: {
        name: input.name,
        type: input.type,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        allowedDomain: input.allowedDomain,
        provisioningPolicy: input.provisioningPolicy,
        defaultRole: input.defaultRole,
        attributeMapping: input.attributeMapping ?? undefined,
        createdById: input.createdById,
      },
    });
    return toSsoProvider({ ...row, _count: { connections: 0 } });
  }

  async findAllProviders(): Promise<SsoProvider[]> {
    const rows = await this.prisma.ssoProvider.findMany({
      orderBy: { createdAt: 'desc' },
      include: PROVIDER_COUNT_INCLUDE,
    });
    return rows.map(toSsoProvider);
  }

  async findProviderById(id: string): Promise<SsoProvider | null> {
    const row = await this.prisma.ssoProvider.findUnique({
      where: { id },
      include: PROVIDER_COUNT_INCLUDE,
    });
    return row ? toSsoProvider(row) : null;
  }

  async findProviderRawById(id: string): Promise<SsoProviderRaw | null> {
    return this.prisma.ssoProvider.findUnique({ where: { id } });
  }

  async findPublicEnabled(): Promise<PublicSsoProvider[]> {
    return this.prisma.ssoProvider.findMany({
      where: { isEnabled: true },
      select: { id: true, name: true, type: true, allowedDomain: true },
    });
  }

  async updateProvider(id: string, patch: ProviderPatch): Promise<SsoProvider> {
    const row = await this.prisma.ssoProvider.update({
      where: { id },
      data: patch as Prisma.SsoProviderUpdateInput,
      include: PROVIDER_COUNT_INCLUDE,
    });
    return toSsoProvider(row);
  }

  async setProviderEnabled(id: string, enabled: boolean): Promise<SsoProvider> {
    const row = await this.prisma.ssoProvider.update({
      where: { id },
      data: { isEnabled: enabled },
      include: PROVIDER_COUNT_INCLUDE,
    });
    return toSsoProvider(row);
  }

  async deleteProvider(id: string): Promise<void> {
    await this.prisma.ssoProvider.delete({ where: { id } });
  }

  async findProviderConnectionsPage(
    providerId: string,
    page: number,
    perPage: number,
  ): Promise<{ items: SsoProviderConnection[]; meta: PaginationMeta }> {
    const skip = (page - 1) * perPage;
    const [rows, total] = await Promise.all([
      this.prisma.ssoConnection.findMany({
        where: { providerId },
        skip,
        take: perPage,
        include: PROVIDER_CONNECTION_INCLUDE,
        orderBy: { lastUsedAt: 'desc' },
      }),
      this.prisma.ssoConnection.count({ where: { providerId } }),
    ]);

    return {
      items: rows.map(toProviderConnection),
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  // ─── SsoConnection lookups (callback flow) ─────────────────

  async findConnectionByExternal(
    providerId: string,
    externalId: string,
  ): Promise<{
    id: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: GlobalRole;
      avatarUrl: string | null;
      isBlocked: boolean;
      deletedAt: Date | null;
    };
  } | null> {
    return this.prisma.ssoConnection.findUnique({
      where: {
        providerId_externalId: { providerId, externalId },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatarUrl: true,
            isBlocked: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  async touchConnectionLastUsed(
    connectionId: string,
    email: string,
  ): Promise<void> {
    await this.prisma.ssoConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date(), email },
    });
  }

  async createConnection(input: {
    userId: string;
    providerId: string;
    externalId: string;
    email: string;
  }): Promise<void> {
    await this.prisma.ssoConnection.create({ data: input });
  }

  async findConnectionByUserAndProvider(
    userId: string,
    providerId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.ssoConnection.findUnique({
      where: { providerId_userId: { providerId, userId } },
      select: { id: true },
    });
  }

  async countConnectionsExcept(
    userId: string,
    providerId: string,
  ): Promise<number> {
    return this.prisma.ssoConnection.count({
      where: { userId, providerId: { not: providerId } },
    });
  }

  async deleteConnections(userId: string, providerId: string): Promise<void> {
    await this.prisma.ssoConnection.deleteMany({ where: { userId, providerId } });
  }

  async findUserConnections(userId: string): Promise<UserSsoConnection[]> {
    const rows = await this.prisma.ssoConnection.findMany({
      where: { userId },
      include: USER_CONNECTION_INCLUDE,
    });
    return rows.map(toUserSsoConnection);
  }

  // ─── Atomic user+connection creates ───────────────────────

  async createUserWithConnection(input: {
    email: string;
    name: string;
    avatarUrl: string | null;
    role: GlobalRole;
    providerId: string;
    externalId: string;
  }): Promise<{
    id: string;
    email: string;
    name: string;
    role: GlobalRole;
    avatarUrl: string | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          name: input.name,
          avatarUrl: input.avatarUrl,
          role: input.role,
          hasPassword: false,
        },
        select: { id: true, email: true, name: true, role: true, avatarUrl: true },
      });

      await tx.ssoConnection.create({
        data: {
          userId: user.id,
          providerId: input.providerId,
          externalId: input.externalId,
          email: input.email,
        },
      });

      return user;
    });
  }

  async acceptInviteWithSsoConnection(input: {
    inviteId: string;
    inviteEmail: string;
    inviteRole: GlobalRole;
    name: string;
    avatarUrl: string | null;
    providerId: string;
    externalId: string;
    externalEmail: string;
  }): Promise<{
    id: string;
    email: string;
    name: string;
    role: GlobalRole;
    avatarUrl: string | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.inviteEmail.toLowerCase(),
          name: input.name,
          avatarUrl: input.avatarUrl,
          role: input.inviteRole,
          hasPassword: false,
        },
        select: { id: true, email: true, name: true, role: true, avatarUrl: true },
      });

      await tx.invite.update({
        where: { id: input.inviteId },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedBy: user.id,
        },
      });

      await tx.ssoConnection.create({
        data: {
          userId: user.id,
          providerId: input.providerId,
          externalId: input.externalId,
          email: input.externalEmail,
        },
      });

      return user;
    });
  }
}
