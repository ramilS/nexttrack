import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AppLogger } from '@/common/logging/app-logger';
import { MailService } from './mail.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { UsersReader } from '@/modules/users/users.reader';

@Processor('notification-email', {
  limiter: { max: 10, duration: 1000 },
})
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new AppLogger(EmailProcessor.name);

  constructor(
    private usersRepo: UsersReader,
    private mailService: MailService,
    private outboxPoller: OutboxPollerProcessor,
  ) {
    super();
  }

  async process(job: Job) {
    const { outboxEventId, userId, type, ...data } = job.data;

    this.logger.log('Email job started', {
      outboxEventId,
      userId,
      notificationType: type,
      attempt: job.attemptsMade + 1,
    });

    try {
      const user = await this.usersRepo.findEmailAndNameById(userId);

      if (!user) {
        this.logger.warn('Recipient user not found, skipping email', {
          outboxEventId,
          userId,
          notificationType: type,
        });
        await this.outboxPoller.markProcessed(outboxEventId);
        return;
      }

      await this.mailService.sendNotificationEmail(user.email, {
        type,
        actorName: data.actorName,
        issueKey: data.issueKey,
        issueTitle: data.issueTitle,
        projectName: data.projectName,
        message: data.message,
        actionUrl: data.actionUrl,
      });

      await this.outboxPoller.markProcessed(outboxEventId);

      this.logger.log('Notification email job finished', {
        outboxEventId,
        userId,
        notificationType: type,
      });
    } catch (error) {
      this.logger.error('Email job failed', error, {
        outboxEventId,
        userId,
        notificationType: type,
        attempt: job.attemptsMade + 1,
      });
      const event = await this.outboxPoller.findEventById(outboxEventId);
      if (event) {
        await this.outboxPoller.markFailed(
          outboxEventId,
          event.attempts,
          event.maxAttempts,
          String(error),
        );
      }
      throw error;
    }
  }
}
