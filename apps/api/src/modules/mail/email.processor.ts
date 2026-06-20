import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from './mail.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { UsersReader } from '@/modules/users/users.reader';

@Processor('notification-email', {
  limiter: { max: 10, duration: 1000 },
})
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private usersRepo: UsersReader,
    private mailService: MailService,
    private outboxPoller: OutboxPollerProcessor,
  ) {
    super();
  }

  async process(job: Job) {
    const { outboxEventId, userId, type, ...data } = job.data;

    try {
      const user = await this.usersRepo.findEmailAndNameById(userId);

      if (!user) {
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

      this.logger.log(`Sent notification email to ${user.email} for ${type}`);
    } catch (error) {
      this.logger.error(`Failed to send email for outbox ${outboxEventId}`, error);
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
