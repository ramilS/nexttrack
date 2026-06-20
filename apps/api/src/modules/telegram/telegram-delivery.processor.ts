import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { telegramConfig } from '@/config';
import { EncryptionService } from '@/common/services/encryption.service';
import { TelegramTemplatesService } from './telegram-templates.service';
import { TelegramRepository } from './telegram.repository';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';

@Processor('notification-telegram', {
  limiter: { max: 30, duration: 1000 },
})
@Injectable()
export class TelegramDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramDeliveryProcessor.name);

  constructor(
    private repo: TelegramRepository,
    @Inject(telegramConfig.KEY)
    private config: ConfigType<typeof telegramConfig>,
    private templates: TelegramTemplatesService,
    private outboxPoller: OutboxPollerProcessor,
    private encryption: EncryptionService,
  ) {
    super();
  }

  async process(job: Job) {
    const {
      outboxEventId,
      telegramConfigId,
      chatId,
      parseMode,
      messageTemplate,
      eventType,
      data,
    } = job.data;

    try {
      // Look up bot token from DB at delivery time (never store in outbox payload)
      const tgConfig = await this.repo.findBotTokenById(telegramConfigId);

      if (!tgConfig) {
        this.logger.warn(
          `Telegram config ${telegramConfigId} not found, skipping`,
        );
        await this.outboxPoller.markProcessed(outboxEventId);
        return;
      }

      const text = this.templates.render(eventType, data, messageTemplate);

      const botToken = this.encryption.decryptWithLegacyFallback(
        tgConfig.botToken,
      );
      const url = `${this.config.apiBaseUrl}/bot${botToken}/sendMessage`;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        await this.repo.updateById(telegramConfigId, {
          lastDeliveryAt: new Date(),
          consecutiveFailures: 0,
        });

        await this.outboxPoller.markProcessed(outboxEventId);
        this.logger.log(`Telegram message sent to ${chatId}`);
      } else {
        const body = await response.json().catch(() => ({}));

        // Respect retry_after on 429 — schedule next retry using Telegram's delay
        if (response.status === 429 && body.parameters?.retry_after) {
          const retryAfter = body.parameters.retry_after;
          this.logger.warn(
            `Telegram rate limited, retry after ${retryAfter}s`,
          );

          await this.outboxPoller.rescheduleFor(
            outboxEventId,
            new Date(Date.now() + retryAfter * 1000),
            `Rate limited, retry after ${retryAfter}s`,
          );
          return; // Don't throw — we've scheduled a proper retry
        }

        throw new Error(`Telegram API error: ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Telegram delivery failed for ${outboxEventId}`,
        error,
      );

      const event = await this.outboxPoller.findEventById(outboxEventId);
      if (event) {
        await this.outboxPoller.markFailed(
          outboxEventId,
          event.attempts,
          event.maxAttempts,
          String(error),
        );
      }

      // Track consecutive failures and auto-disable
      const tgConfig = await this.repo.findById(telegramConfigId);

      if (tgConfig) {
        const failures = tgConfig.consecutiveFailures + 1;
        const shouldDisable = failures >= this.config.maxConsecutiveFailures;

        await this.repo.updateById(telegramConfigId, {
          consecutiveFailures: failures,
          ...(shouldDisable
            ? {
                isEnabled: false,
                disabledAt: new Date(),
                disabledReason: `Auto-disabled after ${failures} consecutive failures`,
              }
            : {}),
        });
      }

      throw error;
    }
  }
}
