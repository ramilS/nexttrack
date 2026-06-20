import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface RefreshTokenRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenCreateInput {
  userId: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private prisma: PrismaService) {}

  async findActiveByHash(
    userId: string,
    tokenHash: string,
  ): Promise<RefreshTokenRow | null> {
    return this.prisma.refreshToken.findFirst({
      where: { userId, token: tokenHash },
      select: {
        id: true,
        userId: true,
        token: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async create(input: RefreshTokenCreateInput): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  async revokeById(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeIfActive(id: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeByHash(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
