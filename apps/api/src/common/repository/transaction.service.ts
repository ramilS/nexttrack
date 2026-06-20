import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from './tx.types';

/**
 * Runs the provided function inside a Prisma transaction. Repositories
 * accept the resulting `Tx` handle (optional) so all DB operations within
 * the function share the same atomic context.
 *
 * Usage:
 *   await txService.run(async (tx) => {
 *     await repoA.create(input, tx);
 *     await repoB.update(other, tx);
 *   });
 */
@Injectable()
export class TransactionService {
  constructor(private prisma: PrismaService) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
