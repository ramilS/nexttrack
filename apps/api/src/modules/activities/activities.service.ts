import { Injectable } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { ActivityEntry } from './activity-builder';
import {
  ActivitiesRepository,
  ActivityRow,
  FindByIssueOptions,
} from './activities.repository';
import type { CursorMeta } from '@repo/shared';
import type { Activity } from '@repo/shared/schemas';
import type { Tx } from '@/common/repository/tx.types';

@Injectable()
export class ActivitiesService {
  constructor(private activitiesRepo: ActivitiesRepository) {}

  async record(
    issueId: string,
    actorId: string,
    entries: ActivityEntry[],
    tx?: Tx,
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.activitiesRepo.createMany(
      entries.map((e) => ({
        issueId,
        actorId,
        type: e.type,
        payload: e.payload,
      })),
      tx,
    );
  }

  async recordOne(
    issueId: string,
    actorId: string,
    type: ActivityType,
    payload: Record<string, unknown>,
    tx?: Tx,
  ): Promise<ActivityRow> {
    return this.activitiesRepo.create({ issueId, actorId, type, payload }, tx);
  }

  async findByIssue(
    issueId: string,
    options?: FindByIssueOptions,
  ): Promise<{ items: Activity[]; meta: CursorMeta }> {
    const page = await this.activitiesRepo.findByIssue(issueId, options);
    return { items: page.items.map((a) => this.toActivity(a)), meta: page.meta };
  }

  // Response boundary: map createdAt Date → ISO string so the shape matches
  // activitySchema. payload is always an object in practice (built from
  // ActivityEntry); coalesce defensively for the JsonValue type.
  private toActivity(a: ActivityRow): Activity {
    return {
      id: a.id,
      issueId: a.issueId,
      type: a.type,
      payload: (a.payload ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
      actor: a.actor,
    };
  }
}
