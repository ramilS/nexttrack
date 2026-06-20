import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  CreateWebhookParsed,
  UpdateWebhookInput,
  Webhook,
  WebhookEventType,
  WebhookTestResult,
} from '@repo/shared/schemas';
import { EncryptionService } from '@/common/services/encryption.service';
import { WebhooksRepository, WebhookRow } from './webhooks.repository';

@Injectable()
export class WebhooksService {
  constructor(
    private repo: WebhooksRepository,
    private encryption: EncryptionService,
  ) {}

  // Response boundary: strips the secret and maps Date columns to ISO strings
  // so the shape matches webhookSchema (the ZodSerializerDto response schema).
  // eventTypes is validated against the enum on every write, so the stored
  // strings are always valid WebhookEventType values.
  private toDto(webhook: WebhookRow): Webhook {
    const { secret: _secret, ...rest } = webhook;
    return {
      ...rest,
      eventTypes: rest.eventTypes as WebhookEventType[],
      lastDeliveryAt: rest.lastDeliveryAt?.toISOString() ?? null,
      disabledAt: rest.disabledAt?.toISOString() ?? null,
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
    };
  }

  async findAll(projectId: string) {
    const webhooks = await this.repo.findAllByProject(projectId);
    return webhooks.map((w) => this.toDto(w));
  }

  async findOne(projectId: string, webhookId: string) {
    const webhook = await this.findOneRaw(projectId, webhookId);
    return this.toDto(webhook);
  }

  private async findOneRaw(
    projectId: string,
    webhookId: string,
  ): Promise<WebhookRow> {
    const webhook = await this.repo.findInProject(projectId, webhookId);

    if (!webhook) {
      throw new NotFoundError(ErrorCode.WEBHOOK_NOT_FOUND);
    }

    return webhook;
  }

  async create(projectId: string, userId: string, dto: CreateWebhookParsed) {
    const webhook = await this.repo.create({
      projectId,
      createdById: userId,
      name: dto.name,
      url: dto.url,
      secret: this.encryption.encrypt(dto.secret),
      eventTypes: dto.eventTypes,
      isEnabled: dto.isEnabled,
    });

    return this.toDto(webhook);
  }

  async update(projectId: string, webhookId: string, dto: UpdateWebhookInput) {
    await this.findOneRaw(projectId, webhookId);

    const webhook = await this.repo.update(webhookId, {
      ...dto,
      ...(dto.secret !== undefined
        ? { secret: this.encryption.encrypt(dto.secret) }
        : {}),
      ...(dto.isEnabled === true
        ? { disabledAt: null, disabledReason: null, consecutiveFailures: 0 }
        : {}),
    });

    return this.toDto(webhook);
  }

  async remove(projectId: string, webhookId: string) {
    await this.findOneRaw(projectId, webhookId);
    await this.repo.delete(webhookId);
  }

  async test(
    projectId: string,
    webhookId: string,
  ): Promise<WebhookTestResult> {
    const webhook = await this.findOneRaw(projectId, webhookId);

    const testPayload: WebhookTestResult['testPayload'] = {
      event: 'WEBHOOK_TEST',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };

    return { webhook: { id: webhook.id, name: webhook.name }, testPayload };
  }
}
