import { Test, TestingModule } from '@nestjs/testing';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { mockSsoConfig } from '@test/helpers';
import { telegramConfig } from '@/config';
import { EncryptionService } from '@/common/services/encryption.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { TelegramDeliveryProcessor } from './telegram-delivery.processor';
import { TelegramTemplatesService } from './telegram-templates.service';
import { TelegramRepository } from './telegram.repository';

const BOT_TOKEN = '1234567890:ABCdefGHIJklmnoPQRstuVWXyz';
const CONFIG_ID = 'tg-1';
const OUTBOX_ID = 'outbox-1';
const CHAT_ID = '-1001234567890';

const buildJob = (data: Record<string, unknown> = {}): Job =>
  ({
    data: {
      outboxEventId: OUTBOX_ID,
      telegramConfigId: CONFIG_ID,
      chatId: CHAT_ID,
      parseMode: 'Markdown',
      messageTemplate: null,
      eventType: 'ISSUE_CREATED',
      data: { foo: 'bar' },
      ...data,
    },
  }) as Job;

type RepoMock = jest.Mocked<
  Pick<TelegramRepository, 'findBotTokenById' | 'findById' | 'updateById'>
>;

type PollerMock = jest.Mocked<
  Pick<
    OutboxPollerProcessor,
    'markProcessed' | 'markFailed' | 'findEventById' | 'rescheduleFor'
  >
>;

describe('TelegramDeliveryProcessor', () => {
  let processor: TelegramDeliveryProcessor;
  let repo: RepoMock;
  let poller: PollerMock;
  let encryption: EncryptionService;
  let fetchMock: jest.SpyInstance;

  const config: ConfigType<typeof telegramConfig> = {
    apiBaseUrl: 'https://api.telegram.org',
    timeoutMs: 15000,
    maxConsecutiveFailures: 10,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    encryption = new EncryptionService(mockSsoConfig);
    jest
      .spyOn(encryption['logger'], 'warn')
      .mockImplementation(() => undefined);

    repo = {
      findBotTokenById: jest
        .fn()
        .mockResolvedValue({ botToken: encryption.encrypt(BOT_TOKEN) }),
      findById: jest.fn().mockResolvedValue(null),
      updateById: jest.fn().mockResolvedValue(undefined),
    };

    poller = {
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      findEventById: jest.fn().mockResolvedValue(null),
      rescheduleFor: jest.fn().mockResolvedValue(undefined),
    };

    const templates = {
      render: jest.fn().mockReturnValue('rendered message'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDeliveryProcessor,
        { provide: TelegramRepository, useValue: repo },
        { provide: OutboxPollerProcessor, useValue: poller },
        { provide: TelegramTemplatesService, useValue: templates },
        { provide: telegramConfig.KEY, useValue: config },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    processor = module.get(TelegramDeliveryProcessor);

    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('bot token decryption', () => {
    it('decrypts the stored token before calling the Telegram API', async () => {
      await processor.process(buildJob());

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      );
      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
    });

    it('never sends the raw ciphertext to the Telegram API', async () => {
      const ciphertext = encryption.encrypt(BOT_TOKEN);
      repo.findBotTokenById.mockResolvedValue({ botToken: ciphertext });

      await processor.process(buildJob());

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).not.toContain(ciphertext);
    });

    it('falls back to a legacy plaintext token and warns', async () => {
      const warnSpy = jest.spyOn(encryption['logger'], 'warn');
      repo.findBotTokenById.mockResolvedValue({ botToken: BOT_TOKEN });

      await processor.process(buildJob());

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Legacy plaintext secret'),
      );
    });
  });

  describe('missing config', () => {
    it('marks processed and skips delivery when config not found', async () => {
      repo.findBotTokenById.mockResolvedValue(null);

      await processor.process(buildJob());

      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('resets consecutive failures and marks processed on 200', async () => {
      await processor.process(buildJob());

      expect(repo.updateById).toHaveBeenCalledWith(
        CONFIG_ID,
        expect.objectContaining({ consecutiveFailures: 0 }),
      );
      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
    });
  });
});
