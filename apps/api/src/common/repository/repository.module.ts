import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { TransactionService } from './transaction.service';

/**
 * Provides shared repository infrastructure (currently just
 * TransactionService). Marked @Global so any feature module can inject
 * `TransactionService` without re-importing.
 */
@Global()
@Module({
  providers: [PrismaService, TransactionService],
  exports: [TransactionService],
})
export class RepositoryModule {}
