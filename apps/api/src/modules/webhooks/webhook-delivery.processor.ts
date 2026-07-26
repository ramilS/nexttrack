import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { isIP } from 'node:net';
import { Agent, type Dispatcher } from 'undici';
import { AppLogger } from '@/common/logging/app-logger';
import { webhookConfig } from '@/config';
import { EncryptionService } from '@/common/services/encryption.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { WebhooksRepository } from './webhooks.repository';
import {
  WebhookUrlError,
  assertResolvedAddressIsPublic,
  validateWebhookUrlSync,
} from './url-validator';
import {
  buildChatPayload,
  formatChatMessage,
  type ChatWebhookProvider,
} from './chat-webhook-formatter';

function isChatProvider(provider: string): provider is ChatWebhookProvider {
  return provider === 'SLACK' || provider === 'DISCORD' || provider === 'TEAMS';
}

const USER_AGENT = 'next-track-webhooks/1.0';

@Processor('notification-webhook')
@Injectable()
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new AppLogger(WebhookDeliveryProcessor.name);

  constructor(
    private repo: WebhooksRepository,
    @Inject(webhookConfig.KEY)
    private config: ConfigType<typeof webhookConfig>,
    private outboxPoller: OutboxPollerProcessor,
    private encryption: EncryptionService,
  ) {
    super();
  }

  async process(job: Job) {
    const { outboxEventId, webhookId, eventType, data } = job.data;
    const startedAt = Date.now();

    this.logger.log('Webhook delivery started', {
      outboxEventId,
      webhookId,
      eventType,
      attempt: job.attemptsMade + 1,
    });

    try {
      const webhook = await this.repo.findDeliveryContext(webhookId);

      if (!webhook) {
        this.logger.warn('Webhook not found, skipping', {
          outboxEventId,
          webhookId,
        });
        await this.outboxPoller.markProcessed(outboxEventId);
        return;
      }

      if (!webhook.isEnabled) {
        this.logger.warn('Webhook disabled, skipping', {
          outboxEventId,
          webhookId,
        });
        await this.outboxPoller.markProcessed(outboxEventId);
        return;
      }

      // Re-validate URL each time. Defends against DNS rebinding and against
      // the row in DB drifting underneath the queue payload.
      const liveUrl = webhook.url;
      const parsed = validateWebhookUrlSync(liveUrl, this.config.allowPrivateUrls);
      const validatedAddress = await assertResolvedAddressIsPublic(
        parsed.hostname,
        this.config.allowPrivateUrls,
      );

      // Pin the connection to the IP we just validated so undici does not
      // re-resolve the hostname between validation and connect — that second
      // lookup is the DNS-rebinding TOCTOU window. Host header + TLS SNI still
      // use the original hostname (we keep passing liveUrl to fetch).
      const pinnedFamily = isIP(validatedAddress);
      const dispatcher =
        this.config.allowPrivateUrls || pinnedFamily === 0
          ? undefined
          : new Agent({
              connect: {
                lookup: (_hostname, _options, callback) => {
                  callback(null, validatedAddress, pinnedFamily);
                },
              },
            });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = isChatProvider(webhook.provider)
        ? JSON.stringify(
            buildChatPayload(
              webhook.provider,
              formatChatMessage(webhook.provider, eventType, data),
            ),
          )
        : JSON.stringify(data);
      const signature = this.sign(
        timestamp,
        body,
        this.encryption.decryptWithLegacyFallback(webhook.secret),
      );

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );

      // `dispatcher` lives on undici's RequestInit, not lib.dom's; assign via a
      // typed variable so the global fetch call accepts it without `as any`.
      const init: RequestInit & { dispatcher?: Dispatcher } = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'X-Event-Type': eventType,
          'X-Delivery-Id': outboxEventId,
          'X-Signature': `sha256=${signature}`,
          'X-Timestamp': timestamp,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
        dispatcher,
      };

      let response: Response;
      try {
        response = await fetch(liveUrl, init);
      } finally {
        clearTimeout(timeout);
        await dispatcher?.close();
      }

      await this.consumeBoundedBody(response, this.config.maxResponseBytes);

      const durationMs = Date.now() - startedAt;

      await this.repo.update(webhookId, {
        lastDeliveryAt: new Date(),
        lastStatusCode: response.status,
        ...(response.ok ? { consecutiveFailures: 0 } : {}),
      });

      if (response.ok) {
        await this.outboxPoller.markProcessed(outboxEventId);
        await this.recordDelivery(
          webhookId,
          outboxEventId,
          eventType,
          response.status,
          true,
          null,
          durationMs,
        );
        this.logger.log('Webhook delivered', {
          outboxEventId,
          webhookId,
          status: response.status,
          durationMs,
        });
      } else {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        await this.recordDelivery(
          webhookId,
          outboxEventId,
          eventType,
          response.status,
          false,
          errorMsg,
          durationMs,
        );
        if (this.isPermanent(response.status)) {
          const event = await this.outboxPoller.findEventById(outboxEventId);
          if (event) {
            await this.outboxPoller.markFailed(
              outboxEventId,
              event.maxAttempts - 1,
              event.maxAttempts,
              errorMsg,
            );
          }
          await this.bumpFailureCounter(webhookId);
          this.logger.warn('Webhook delivery failed permanently (non-retryable status)', {
            outboxEventId,
            webhookId,
            status: response.status,
            durationMs,
          });
          return;
        }
        // Retryable failure — the catch block logs it (with attempt count) and
        // schedules the retry; don't double-log here.
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = sanitizeError(error);
      this.logger.error('Webhook delivery failed', error, {
        outboxEventId,
        webhookId,
        eventType,
        attempt: job.attemptsMade + 1,
      });

      const event = await this.outboxPoller.findEventById(outboxEventId);

      if (event) {
        await this.outboxPoller.markFailed(
          outboxEventId,
          event.attempts,
          event.maxAttempts,
          errorMsg,
        );
      }

      await this.bumpFailureCounter(webhookId);

      if (error instanceof WebhookUrlError) return;

      throw error;
    }
  }

  private isPermanent(status: number): boolean {
    if (status === 408 || status === 429) return false;
    return status >= 400 && status < 500;
  }

  private async consumeBoundedBody(response: Response, maxBytes: number) {
    if (!response.body) return;
    const reader = response.body.getReader();
    let read = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value?.byteLength ?? 0;
      if (read > maxBytes) {
        await reader.cancel();
        break;
      }
    }
  }

  private async bumpFailureCounter(webhookId: string) {
    const webhook = await this.repo.findById(webhookId);
    if (!webhook) return;

    const failures = webhook.consecutiveFailures + 1;
    const shouldDisable = failures >= this.config.maxConsecutiveFailures;

    await this.repo.update(webhookId, {
      consecutiveFailures: failures,
      ...(shouldDisable
        ? {
            isEnabled: false,
            disabledAt: new Date(),
            disabledReason: `Auto-disabled after ${failures} consecutive failures`,
          }
        : {}),
    });

    if (shouldDisable) {
      this.logger.warn('Webhook auto-disabled after consecutive failures', {
        webhookId,
        consecutiveFailures: failures,
      });
    }
  }

  private sign(timestamp: string, body: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }

  private async recordDelivery(
    webhookId: string,
    outboxEventId: string,
    eventType: string,
    statusCode: number | null,
    success: boolean,
    error: string | null,
    durationMs: number,
  ) {
    await this.repo
      .createDeliveryLog({
        webhookId,
        outboxEventId,
        eventType,
        statusCode,
        success,
        error,
        durationMs,
      })
      .catch((err: Error) =>
        this.logger.warn(`Failed to record delivery log: ${err.message}`),
      );
  }
}

function sanitizeError(error: unknown): string {
  return String(error).slice(0, 2000);
}
