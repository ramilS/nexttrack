import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { EncryptionService } from '@/common/services/encryption.service';
import type {
  CreateTelegramConfigInput,
  UpdateTelegramConfigInput,
  TelegramConfig,
  TelegramTestResult,
  TelegramParseMode,
} from '@repo/shared/schemas';
import { TelegramRepository, TelegramConfigRow } from './telegram.repository';

@Injectable()
export class TelegramService {
  private readonly logger = new AppLogger(TelegramService.name);

  constructor(
    private repo: TelegramRepository,
    private encryption: EncryptionService,
  ) {}

  async findOne(projectId: string) {
    const config = await this.repo.findByProjectId(projectId);
    if (!config) {
      throw new NotFoundError(ErrorCode.TELEGRAM_CONFIG_NOT_FOUND);
    }
    return this.toDto(config);
  }

  async create(projectId: string, userId: string, dto: CreateTelegramConfigInput) {
    const existing = await this.repo.findByProjectId(projectId);

    if (existing) {
      throw new ValidationError(ErrorCode.TELEGRAM_CONFIG_EXISTS);
    }

    const config = await this.repo.create({
      projectId,
      createdById: userId,
      name: dto.name,
      botToken: this.encryption.encrypt(dto.botToken),
      chatId: dto.chatId,
      messageTemplate: dto.messageTemplate,
      eventTypes: dto.eventTypes,
      isEnabled: dto.isEnabled,
      parseMode: dto.parseMode,
    });

    this.logger.log('Telegram config created', {
      telegramConfigId: config.id,
      projectId,
      fields: Object.keys(dto),
    });

    return this.toDto(config);
  }

  async update(projectId: string, dto: UpdateTelegramConfigInput) {
    await this.findOne(projectId);

    this.logger.log('Updating telegram config', {
      projectId,
      fields: Object.keys(dto),
    });

    const updated = await this.repo.updateByProjectId(projectId, {
      ...dto,
      ...(dto.botToken !== undefined
        ? { botToken: this.encryption.encrypt(dto.botToken) }
        : {}),
      ...(dto.isEnabled === true
        ? { disabledAt: null, disabledReason: null, consecutiveFailures: 0 }
        : {}),
    });

    return this.toDto(updated);
  }

  async remove(projectId: string) {
    await this.findOne(projectId);
    await this.repo.deleteByProjectId(projectId);
    this.logger.log('Telegram config deleted', { projectId });
  }

  async test(projectId: string): Promise<TelegramTestResult> {
    const config = await this.findOne(projectId);
    return {
      config: { id: config.id, name: config.name },
      testMessage: 'This is a test Telegram notification from NextTrack',
    };
  }

  // Response boundary: strips botToken (a secret) and maps Date columns to ISO
  // strings so the shape matches telegramConfigSchema. parseMode is validated
  // against TELEGRAM_PARSE_MODES on every write, so the stored value is always
  // a valid TelegramParseMode.
  private toDto(config: TelegramConfigRow): TelegramConfig {
    const { botToken: _botToken, ...rest } = config;
    return {
      ...rest,
      parseMode: rest.parseMode as TelegramParseMode,
      disabledAt: rest.disabledAt?.toISOString() ?? null,
      lastDeliveryAt: rest.lastDeliveryAt?.toISOString() ?? null,
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
    };
  }
}
