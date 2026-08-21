import { Injectable } from '@nestjs/common';
import { GlobalRole, UserKind } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';

export interface ApiKeyRow {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  prefix: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyPrincipalRow {
  id: string;
  userId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: GlobalRole;
    kind: UserKind;
    isBlocked: boolean;
    deletedAt: Date | null;
  };
}

export interface ApiKeyCreateInput {
  projectId: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  expiresAt: Date | null;
  createdById: string;
}

const ROW_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  name: true,
  prefix: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeysRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  findActiveByHash(tokenHash: string): Promise<ApiKeyPrincipalRow | null> {
    return this.prisma.projectApiKey.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            role: true,
            kind: true,
            isBlocked: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  create(input: ApiKeyCreateInput, tx?: Tx): Promise<ApiKeyRow> {
    return this.db(tx).projectApiKey.create({ data: input, select: ROW_SELECT });
  }

  findById(id: string): Promise<ApiKeyRow | null> {
    return this.prisma.projectApiKey.findUnique({ where: { id }, select: ROW_SELECT });
  }

  /**
   * Unbounded by design: API keys are a human-managed list per project
   * (single digits in practice), not a growing data set — no pagination
   * needed.
   */
  listByProject(projectId: string): Promise<ApiKeyRow[]> {
    return this.prisma.projectApiKey.findMany({
      where: { projectId },
      select: ROW_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Idempotent: `revokedAt: null` in the filter means a second concurrent
   * revoke of the same key matches zero rows instead of clobbering the
   * first call's timestamp — no error either way.
   */
  async revoke(id: string, tx?: Tx): Promise<void> {
    await this.db(tx).projectApiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.projectApiKey.update({ where: { id }, data: { lastUsedAt: at } });
  }

  countActiveForUser(userId: string): Promise<number> {
    return this.prisma.projectApiKey.count({
      where: { userId, revokedAt: null },
    });
  }
}
