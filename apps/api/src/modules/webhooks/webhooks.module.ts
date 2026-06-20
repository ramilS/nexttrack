import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhooksRepository } from './webhooks.repository';
import {
  CreateWebhookValidationPipe,
  UpdateWebhookValidationPipe,
} from './webhook-validation.pipe';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { EncryptionService } from '@/common/services/encryption.service';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: 'notification-webhook' }),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookDeliveryProcessor,
    WebhooksRepository,
    EncryptionService,
    CreateWebhookValidationPipe,
    UpdateWebhookValidationPipe,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
