import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { AppLogger } from '@/common/logging/app-logger';
import { notificationConfig, appConfig } from '@/config';
import {
  NotificationsDispatchService,
  SYSTEM_ACTOR_ID,
} from './notifications-dispatch.service';
import { NotificationsRepository } from './notifications.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { OutboxRepository } from '@/modules/outbox/outbox.repository';
import { IdempotencyRepository } from '@/common/idempotency/idempotency.repository';

const DUE_DATE_KEY = 'notif-due-date-recurring';
const CLEANUP_KEY = 'notif-cleanup-recurring';
const CLEANUP_CRON = '15 3 * * *'; // 03:15 daily

@Processor('notification-jobs')
@Injectable()
export class NotificationJobsProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new AppLogger(NotificationJobsProcessor.name);

  constructor(
    private issuesRepo: IssuesReader,
    private notificationsRepo: NotificationsRepository,
    private outboxRepo: OutboxRepository,
    @Inject(notificationConfig.KEY)
    private config: ConfigType<typeof notificationConfig>,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
    @InjectQueue('notification-jobs') private queue: Queue,
    private dispatch: NotificationsDispatchService,
    private idempotencyRepo: IdempotencyRepository,
  ) {
    super();
  }

  async onModuleInit() {
    if (this.app.nodeEnv === 'test') return;

    // Replace any prior repeatables to keep cron config in sync with code.
    const repeatables = await this.queue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === 'due-date-check' || r.name === 'cleanup') {
        await this.queue.removeRepeatableByKey(r.key);
      }
    }

    await this.queue.add(
      'due-date-check',
      {},
      {
        repeat: { pattern: this.config.dueDateCheckCron },
        jobId: DUE_DATE_KEY,
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 50 },
      },
    );

    await this.queue.add(
      'cleanup',
      {},
      {
        repeat: { pattern: CLEANUP_CRON },
        jobId: CLEANUP_KEY,
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log('Notification jobs scheduled', {
      dueDateCron: this.config.dueDateCheckCron,
      cleanupCron: CLEANUP_CRON,
    });
  }

  async process(job: Job) {
    this.logger.log('Notification job started', {
      job: job.name,
      attempt: job.attemptsMade + 1,
    });

    try {
      switch (job.name) {
        case 'due-date-check':
          return await this.checkDueDates();
        case 'cleanup':
          return await this.cleanup();
        default:
          this.logger.warn('Unknown notification job', { job: job.name });
      }
    } catch (error) {
      this.logger.error('Notification job failed', error, {
        job: job.name,
        attempt: job.attemptsMade + 1,
      });
      throw error;
    }
  }

  private async checkDueDates() {
    const now = new Date();
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const issues = await this.issuesRepo.findDueIssuesForNotification(
      in23h,
      in25h,
    );

    for (const issue of issues) {
      const recipientIds = [...issue.watcherUserIds];
      if (issue.assigneeId && !recipientIds.includes(issue.assigneeId)) {
        recipientIds.push(issue.assigneeId);
      }

      await this.dispatch.dispatch({
        type: NotificationType.DUE_DATE,
        actorId: SYSTEM_ACTOR_ID,
        recipientIds,
        issueId: issue.id,
        projectId: issue.projectId,
        payload: {
          issueKey: `${issue.projectKey}-${issue.number}`,
          issueTitle: issue.title,
          projectName: issue.projectName,
          dueDate: issue.dueDate?.toISOString(),
        },
      });
    }

    this.logger.log('Due date check finished', { issuesNotified: issues.length });
  }

  private async cleanup() {
    const now = new Date();

    // Old notifications.
    const notifCutoff = new Date(
      now.getTime() - this.config.retentionDays * 24 * 60 * 60 * 1000,
    );
    const deletedNotifs = await this.notificationsRepo.deleteOlderThan(
      notifCutoff,
    );

    // Processed outbox events (24 hours).
    const processedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deletedProcessed =
      await this.outboxRepo.deleteProcessedOlderThan(processedCutoff);

    // Failed outbox events (30 days).
    const failedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deletedFailed =
      await this.outboxRepo.deleteFailedOlderThan(failedCutoff);

    // Idempotency keys (7 days — far past any outbox retry window).
    const keysCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deletedKeys = await this.idempotencyRepo.deleteOlderThan(keysCutoff);

    this.logger.log('Cleanup finished', {
      deletedNotifications: deletedNotifs,
      deletedProcessedOutbox: deletedProcessed,
      deletedFailedOutbox: deletedFailed,
      deletedIdempotencyKeys: deletedKeys,
    });
  }
}
