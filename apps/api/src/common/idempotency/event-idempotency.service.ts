import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { IdempotencyRepository } from './idempotency.repository';

/**
 * Exactly-once guard for domain-event side effects. Delivery is at-least-once
 * (outbox retries), so listeners wrap each non-idempotent write in
 * runOnce(key, work): the key is claimed in the same transaction as the
 * write — a redelivered event finds the key and skips, a failed work rolls
 * the claim back so the retry runs it again.
 */
@Injectable()
export class EventIdempotencyService {
  private readonly logger = new AppLogger(EventIdempotencyService.name);

  constructor(
    private txService: TransactionService,
    private repo: IdempotencyRepository,
  ) {}

  async runOnce(
    key: string,
    work: (tx: Tx) => Promise<void>,
  ): Promise<boolean> {
    let ran = false;
    await this.txService.run(async (tx) => {
      const claimed = await this.repo.claim(tx, key);
      if (!claimed) {
        this.logger.debug('Idempotency key already claimed; skipping side effect', { key });
        return;
      }
      await work(tx);
      ran = true;
    });
    return ran;
  }
}
