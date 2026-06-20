import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';

@Injectable()
export class IdempotencyRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Claims `key` inside the caller's transaction. Returns false when the key
   * already exists. Uses createMany+skipDuplicates (ON CONFLICT DO NOTHING)
   * because a caught unique-violation error would poison the surrounding
   * Postgres transaction.
   */
  async claim(tx: Tx, key: string): Promise<boolean> {
    const { count } = await tx.idempotencyKey.createMany({
      data: [{ key }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}
