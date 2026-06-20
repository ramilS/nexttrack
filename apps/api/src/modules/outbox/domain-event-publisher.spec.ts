import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryChannel } from '@prisma/client';
import { DomainEventPublisher } from './domain-event-publisher';
import { OutboxService } from './outbox.service';
import type { Tx } from '@/common/repository/tx.types';

describe('DomainEventPublisher', () => {
  let publisher: DomainEventPublisher;
  let outboxService: { createOutboxEvents: jest.Mock };

  const tx = { sentinel: 'tx' } as unknown as Tx;

  beforeEach(async () => {
    outboxService = {
      createOutboxEvents: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventPublisher,
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    publisher = module.get(DomainEventPublisher);
  });

  it('persists the event as an INTERNAL outbox row inside the given tx', async () => {
    await publisher.publish(
      {
        eventType: 'issue.updated',
        aggregateType: 'Issue',
        aggregateId: 'issue-1',
        payload: { title: 'New title' },
      },
      tx,
    );

    expect(outboxService.createOutboxEvents).toHaveBeenCalledWith(tx, [
      {
        aggregateType: 'Issue',
        aggregateId: 'issue-1',
        eventType: 'issue.updated',
        channel: DeliveryChannel.INTERNAL,
        payload: { title: 'New title' },
      },
    ]);
  });

  it('propagates outbox failures so the surrounding tx rolls back', async () => {
    outboxService.createOutboxEvents.mockRejectedValue(new Error('DB down'));

    await expect(
      publisher.publish(
        {
          eventType: 'issue.created',
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          payload: {},
        },
        tx,
      ),
    ).rejects.toThrow('DB down');
  });
});
