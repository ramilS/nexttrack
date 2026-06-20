import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailTemplatesService } from './mail-templates.service';
import { EmailProcessor } from './email.processor';
import { OutboxModule } from '@/modules/outbox/outbox.module';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: 'notification-email' }),
  ],
  providers: [MailService, MailTemplatesService, EmailProcessor],
  exports: [MailService, MailTemplatesService],
})
export class MailModule {}
