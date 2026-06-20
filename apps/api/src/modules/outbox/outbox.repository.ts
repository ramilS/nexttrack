import { Injectable } from '@nestjs/common';
import { DeliveryChannel, OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { Tx } from '@/common/repository/tx.types';

export interface ClaimedOutboxEvent {
  id: string;
  channel: DeliveryChannel;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  traceparent: string | null;
}

export interface OutboxEventAttempts {
  id: string;
  attempts: number;
  maxAttempts: number;
  status: OutboxStatus;
}

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  channel: DeliveryChannel;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  traceparent?: string | null;
}

@Injectable()
export class OutboxRepository {
  constructor(private prisma: PrismaService) {}

  async createOutboxEvents(events: OutboxEventInput[], tx?: Tx): Promise<void> {
    if (events.length === 0) return;

    await (tx ?? this.prisma).outboxEvent.createMany({
      data: events.map((e) => ({
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        eventType: e.eventType,
        channel: e.channel,
        payload: e.payload as Prisma.InputJsonObject,
        traceparent: e.traceparent ?? null,
        status: OutboxStatus.PENDING,
        maxAttempts: e.maxAttempts ?? 5,
        nextRetryAt: new Date(),
      })),
    });
  }

  /**
   * Recovers PROCESSING events stuck after a worker crash by flipping them
   * back to PENDING with a fresh nextRetryAt.
   */
  async recoverStaleProcessing(
    now: Date,
    staleThreshold: Date,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = ${OutboxStatus.PENDING}::outbox_status,
          next_retry_at = ${now}
      WHERE status = ${OutboxStatus.PROCESSING}::outbox_status
        AND updated_at < ${staleThreshold}
    `;
  }

  /**
   * Atomically claim a batch of PENDING events whose next_retry_at has elapsed,
   * using `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent pollers across
   * replicas claim disjoint sets.
   */
  async claimPendingBatch(
    now: Date,
    batchSize: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const rows = await this.prisma.$queryRaw<ClaimedOutboxEvent[]>`
      WITH claimed AS (
        SELECT id FROM outbox_events
        WHERE status = ${OutboxStatus.PENDING}::outbox_status
          AND next_retry_at <= ${now}
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events e
      SET status = ${OutboxStatus.PROCESSING}::outbox_status,
          updated_at = ${now}
      FROM claimed
      WHERE e.id = claimed.id
      RETURNING
        e.id,
        e.channel,
        e.event_type   AS "eventType",
        e.payload,
        e.attempts,
        e.max_attempts AS "maxAttempts",
        e.traceparent
    `;

    return rows;
  }

  async markProcessed(outboxEventId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: OutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
  }

  async markFailedWithBackoff(
    outboxEventId: string,
    currentAttempts: number,
    maxAttempts: number,
    error: string,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const isFinal = attempts >= maxAttempts;

    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: isFinal ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        attempts,
        lastError: error.slice(0, 2000),
        nextRetryAt: isFinal
          ? null
          : new Date(Date.now() + Math.pow(2, attempts) * 1000),
        processedAt: isFinal ? new Date() : null,
      },
    });
  }

  async rescheduleAt(
    outboxEventId: string,
    nextRetryAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: OutboxStatus.PENDING,
        attempts: { increment: 1 },
        lastError: lastError.slice(0, 2000),
        nextRetryAt,
      },
    });
  }

  async findAttemptsById(
    outboxEventId: string,
  ): Promise<OutboxEventAttempts | null> {
    return this.prisma.outboxEvent.findUnique({
      where: { id: outboxEventId },
      select: { id: true, attempts: true, maxAttempts: true, status: true },
    });
  }

  /**
   * Counts events grouped by status. Every {@link OutboxStatus} value is
   * present in the result, defaulting to 0 when no rows exist.
   */
  async countByStatus(): Promise<Record<OutboxStatus, number>> {
    const groups = await this.prisma.outboxEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const grouped = new Map(groups.map((g) => [g.status, g._count._all]));

    return Object.fromEntries(
      Object.values(OutboxStatus).map((status) => [
        status,
        grouped.get(status) ?? 0,
      ]),
    ) as Record<OutboxStatus, number>;
  }

  async deleteProcessedOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        status: OutboxStatus.PROCESSED,
        processedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  async deleteFailedOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        status: OutboxStatus.FAILED,
        createdAt: { lt: cutoff },
      },
    });
    return result.count;
  }
}
