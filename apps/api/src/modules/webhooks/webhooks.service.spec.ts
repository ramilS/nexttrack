import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import type {
  CreateWebhookParsed,
  UpdateWebhookInput,
} from '@repo/shared/schemas';
import { mockSsoConfig } from '@test/helpers';
import { EncryptionService } from '@/common/services/encryption.service';
import { WebhooksService } from './webhooks.service';
import { WebhooksRepository, WebhookRow } from './webhooks.repository';

const baseWebhook = (overrides: Partial<WebhookRow> = {}): WebhookRow => ({
  id: 'wh-1',
  projectId: 'proj-1',
  createdById: 'user-1',
  name: 'My Webhook',
  url: 'https://example.com/hook',
  provider: 'GENERIC',
  secret: 'supersecretkey1234567890abcdef12',
  eventTypes: ['ASSIGNEE_CHANGED'],
  isEnabled: true,
  disabledAt: null,
  disabledReason: null,
  consecutiveFailures: 0,
  lastDeliveryAt: null,
  lastStatusCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('WebhooksService', () => {
  let service: WebhooksService;
  let repo: Record<string, jest.Mock>;
  let encryption: EncryptionService;

  beforeEach(async () => {
    encryption = new EncryptionService(mockSsoConfig);

    repo = {
      findAllByProject: jest.fn().mockResolvedValue([]),
      findInProject: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: WebhooksRepository, useValue: repo },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  describe('findAll', () => {
    it('strips secret from all webhooks', async () => {
      repo.findAllByProject.mockResolvedValue([baseWebhook(), baseWebhook({ id: 'wh-2' })]);

      const result = await service.findAll('proj-1');

      expect(result).toHaveLength(2);
      expect((result[0] as Record<string, unknown>).secret).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFound when missing', async () => {
      repo.findInProject.mockResolvedValue(null);

      await expect(service.findOne('p', 'w')).rejects.toThrow(NotFoundError);
    });

    it('strips secret from returned webhook', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook());

      const result = await service.findOne('proj-1', 'wh-1');

      expect((result as Record<string, unknown>).secret).toBeUndefined();
      expect(result.id).toBe('wh-1');
    });
  });

  describe('create', () => {
    it('creates webhook and strips secret', async () => {
      repo.create.mockResolvedValue(baseWebhook());

      const dto: CreateWebhookParsed = {
        provider: 'GENERIC' as const,
        name: 'My Webhook',
        url: 'https://example.com/hook',
        secret: 'supersecretkey1234567890abcdef12',
        eventTypes: ['ASSIGNEE_CHANGED'],
        isEnabled: true,
      };
      const result = await service.create('proj-1', 'user-1', dto);

      expect(repo.create).toHaveBeenCalled();
      expect((result as Record<string, unknown>).secret).toBeUndefined();
    });

    it('encrypts the secret at rest', async () => {
      repo.create.mockResolvedValue(baseWebhook());

      const dto: CreateWebhookParsed = {
        provider: 'GENERIC' as const,
        name: 'My Webhook',
        url: 'https://example.com/hook',
        secret: 'supersecretkey1234567890abcdef12',
        eventTypes: ['ASSIGNEE_CHANGED'],
        isEnabled: true,
      };
      await service.create('proj-1', 'user-1', dto);

      const stored = repo.create.mock.calls[0][0].secret as string;
      expect(stored).not.toBe(dto.secret);
      expect(encryption.isEncrypted(stored)).toBe(true);
      expect(encryption.decrypt(stored)).toBe(dto.secret);
    });

    it('auto-generates a secret for chat providers when omitted', async () => {
      repo.create.mockResolvedValue(baseWebhook({ provider: 'SLACK' }));

      const dto: CreateWebhookParsed = {
        provider: 'SLACK',
        name: 'Slack',
        url: 'https://hooks.slack.com/services/xxx',
        eventTypes: ['ASSIGNEE_CHANGED'],
        isEnabled: true,
      };
      await service.create('proj-1', 'user-1', dto);

      const stored = repo.create.mock.calls[0][0].secret as string;
      expect(stored).toBeTruthy();
      expect(encryption.isEncrypted(stored)).toBe(true);
    });
  });

  describe('update', () => {
    it('resets disable fields when re-enabling', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook({ isEnabled: false }));
      repo.update.mockResolvedValue(baseWebhook({ isEnabled: true }));

      const dto: UpdateWebhookInput = { isEnabled: true };
      await service.update('proj-1', 'wh-1', dto);

      expect(repo.update).toHaveBeenCalledWith(
        'wh-1',
        expect.objectContaining({
          isEnabled: true,
          disabledAt: null,
          disabledReason: null,
          consecutiveFailures: 0,
        }),
      );
    });

    it('throws NotFound when webhook missing', async () => {
      repo.findInProject.mockResolvedValue(null);

      const dto: UpdateWebhookInput = { name: 'X' };
      await expect(
        service.update('proj-1', 'wh-1', dto),
      ).rejects.toThrow(NotFoundError);
    });

    it('encrypts the secret when it is updated', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook());
      repo.update.mockResolvedValue(baseWebhook());

      const dto: UpdateWebhookInput = {
        secret: 'rotatedsecretkey1234567890abcdef',
      };
      await service.update('proj-1', 'wh-1', dto);

      const stored = repo.update.mock.calls[0][1].secret as string;
      expect(stored).not.toBe(dto.secret);
      expect(encryption.decrypt(stored)).toBe(dto.secret);
    });

    it('leaves the stored secret untouched when not in the patch', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook());
      repo.update.mockResolvedValue(baseWebhook());

      const dto: UpdateWebhookInput = { name: 'Renamed' };
      await service.update('proj-1', 'wh-1', dto);

      expect(repo.update.mock.calls[0][1]).not.toHaveProperty('secret');
    });
  });

  describe('remove', () => {
    it('deletes after existence check', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook());

      await service.remove('proj-1', 'wh-1');

      expect(repo.delete).toHaveBeenCalledWith('wh-1');
    });
  });

  describe('test', () => {
    it('returns id+name and test payload', async () => {
      repo.findInProject.mockResolvedValue(baseWebhook());

      const result = await service.test('proj-1', 'wh-1');

      expect(result.webhook.id).toBe('wh-1');
      expect(result.testPayload.event).toBe('WEBHOOK_TEST');
    });
  });
});
