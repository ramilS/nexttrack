import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramTemplatesService } from './telegram-templates.service';
import { TelegramDeliveryProcessor } from './telegram-delivery.processor';
import { TelegramRepository } from './telegram.repository';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { EncryptionService } from '@/common/services/encryption.service';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: 'notification-telegram' }),
  ],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramTemplatesService,
    TelegramDeliveryProcessor,
    TelegramRepository,
    EncryptionService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
