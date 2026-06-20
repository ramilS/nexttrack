import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { OutboxRepository } from '@/modules/outbox/outbox.repository';
import { DeliveryChannel, OutboxStatus } from '@prisma/client';

describe('OutboxPoller atomic claim (Integration)', () => {
  let ctx: E2eContext;
  let poller: OutboxPollerProcessor;
  let repo: OutboxRepository;

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (builder) =>
        builder
          .overrideProvider(OutboxPollerProcessor)
          .useClass(OutboxPollerProcessor),
    });
    poller = ctx.app.get(OutboxPollerProcessor);
    repo = ctx.app.get(OutboxRepository);
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);
  });

  async function seedPendingEvent(overrides: Partial<{
    aggregateId: string;
    eventType: string;
    channel: DeliveryChannel;
  }> = {}) {
    return ctx.prisma.outboxEvent.create({
      data: {
        aggregateType: 'Issue',
        aggregateId: overrides.aggregateId ?? 'issue-1',
        eventType: overrides.eventType ?? 'ISSUE_CREATED',
        channel: overrides.channel ?? DeliveryChannel.EMAIL,
        payload: { foo: 'bar' },
        nextRetryAt: new Date(0),
      },
    });
  }

  it('claims a single pending event and flips it to PROCESSING', async () => {
    const event = await seedPendingEvent();

    const claimed = await poller.pollOnce();
    expect(claimed).toBe(1);

    const after = await ctx.prisma.outboxEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.status).toBe(OutboxStatus.PROCESSING);
  });

  it('returns 0 when there are no pending events', async () => {
    const claimed = await poller.pollOnce();
    expect(claimed).toBe(0);
  });

  it('skips events whose nextRetryAt is in the future', async () => {
    await ctx.prisma.outboxEvent.create({
      data: {
        aggregateType: 'Issue',
        aggregateId: 'issue-future',
        eventType: 'ISSUE_CREATED',
        channel: DeliveryChannel.EMAIL,
        payload: {},
        nextRetryAt: new Date(Date.now() + 60_000),
      },
    });

    expect(await poller.pollOnce()).toBe(0);
  });

  it('claims each event exactly once under concurrent pollers', async () => {
    // Seed 6 pending events.
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        seedPendingEvent({ aggregateId: `issue-${i}` }),
      ),
    );

    // Three concurrent pollers race to claim.
    const claims = await Promise.all([
      poller.pollOnce(),
      poller.pollOnce(),
      poller.pollOnce(),
    ]);

    // Total claimed across all pollers must equal seeded events.
    expect(claims.reduce((a, b) => a + b, 0)).toBe(6);

    const events = await ctx.prisma.outboxEvent.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(6);
    for (const e of events) {
      expect(e.status).toBe(OutboxStatus.PROCESSING);
    }
  });

  it('round-trips traceparent through createOutboxEvents → claimPendingBatch', async () => {
    const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    await repo.createOutboxEvents([
      {
        aggregateType: 'Issue',
        aggregateId: 'issue-tp',
        eventType: 'issue.created',
        channel: DeliveryChannel.INTERNAL,
        payload: { foo: 'bar' },
        traceparent: tp,
      },
    ]);

    const claimed = await repo.claimPendingBatch(new Date(), 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].traceparent).toBe(tp);
  });

  it('returns null traceparent when none was stored', async () => {
    await repo.createOutboxEvents([
      {
        aggregateType: 'Issue',
        aggregateId: 'issue-no-tp',
        eventType: 'issue.created',
        channel: DeliveryChannel.INTERNAL,
        payload: {},
      },
    ]);

    const claimed = await repo.claimPendingBatch(new Date(), 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].traceparent).toBeNull();
  });

  it('recovers PROCESSING events stuck longer than staleTimeoutMs', async () => {
    // Insert an event that is "stuck" in PROCESSING with an old updatedAt.
    const ancient = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const event = await ctx.prisma.outboxEvent.create({
      data: {
        aggregateType: 'Issue',
        aggregateId: 'stuck',
        eventType: 'ISSUE_CREATED',
        channel: DeliveryChannel.EMAIL,
        payload: {},
        status: OutboxStatus.PROCESSING,
      },
    });
    // Force updatedAt to the past (Prisma's @updatedAt would otherwise touch it).
    await ctx.prisma.$executeRaw`
      UPDATE outbox_events SET updated_at = ${ancient} WHERE id = ${event.id}
    `;

    // Pollers reset stale rows back to PENDING and then claim them.
    const claimed = await poller.pollOnce();
    expect(claimed).toBe(1);

    const after = await ctx.prisma.outboxEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.status).toBe(OutboxStatus.PROCESSING);
  });
});
