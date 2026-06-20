import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { EventIdempotencyService } from './event-idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';

describe('EventIdempotencyService', () => {
  let service: EventIdempotencyService;
  let repo: { claim: jest.Mock };
  let txHandle: Tx;

  beforeEach(async () => {
    txHandle = {} as Tx;
    repo = { claim: jest.fn().mockResolvedValue(true) };
    const txService = {
      run: jest.fn().mockImplementation(<T,>(fn: (tx: Tx) => Promise<T>) => fn(txHandle)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIdempotencyService,
        { provide: IdempotencyRepository, useValue: repo },
        { provide: TransactionService, useValue: txService },
      ],
    }).compile();

    service = module.get(EventIdempotencyService);
  });

  it('claims the key and runs the work in the same transaction', async () => {
    const work = jest.fn().mockResolvedValue(undefined);

    const ran = await service.runOnce('evt-1:activity', work);

    expect(ran).toBe(true);
    expect(repo.claim).toHaveBeenCalledWith(txHandle, 'evt-1:activity');
    expect(work).toHaveBeenCalledWith(txHandle);
  });

  it('skips the work when the key was already claimed', async () => {
    repo.claim.mockResolvedValue(false);
    const work = jest.fn();

    const ran = await service.runOnce('evt-1:activity', work);

    expect(ran).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it('propagates work failures so the event is retried', async () => {
    const work = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(service.runOnce('evt-1:activity', work)).rejects.toThrow('db down');
  });
});
