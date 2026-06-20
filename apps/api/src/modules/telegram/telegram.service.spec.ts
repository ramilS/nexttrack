import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { mockSsoConfig } from '@test/helpers';
import { EncryptionService } from '@/common/services/encryption.service';
import { TelegramService } from './telegram.service';
import { TelegramRepository, TelegramConfigRow } from './telegram.repository';
import type {
  CreateTelegramConfigInput,
  UpdateTelegramConfigInput,
} from '@repo/shared/schemas';

const baseConfig = (
  overrides: Partial<TelegramConfigRow> = {},
): TelegramConfigRow => ({
  id: 'tg-1',
  projectId: 'proj-1',
  createdById: 'user-1',
  name: 'Project Alerts',
  botToken: 'bot-token-secret',
  chatId: '-1001234567890',
  parseMode: 'Markdown',
  messageTemplate: null,
  eventTypes: ['ISSUE_CREATED'],
  isEnabled: true,
  disabledAt: null,
  disabledReason: null,
  consecutiveFailures: 0,
  lastDeliveryAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TelegramService', () => {
  let service: TelegramService;
  let repo: Record<string, jest.Mock>;
  let encryption: EncryptionService;

  beforeEach(async () => {
    encryption = new EncryptionService(mockSsoConfig);

    repo = {
      findByProjectId: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateByProjectId: jest.fn(),
      deleteByProjectId: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: TelegramRepository, useValue: repo },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  describe('findOne', () => {
    it('strips botToken from response', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());

      const result = (await service.findOne(
        'proj-1',
      )) as Record<string, unknown>;

      expect(result.botToken).toBeUndefined();
      expect(result.id).toBe('tg-1');
    });

    it('throws NotFound when missing', async () => {
      repo.findByProjectId.mockResolvedValue(null);

      await expect(service.findOne('proj-1')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('create', () => {
    it('throws BadRequest when config already exists', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());

      await expect(
        service.create('proj-1', 'user-1', {} as CreateTelegramConfigInput),
      ).rejects.toThrow(ValidationError);
    });

    it('creates and strips botToken', async () => {
      repo.findByProjectId.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseConfig());

      const dto: CreateTelegramConfigInput = {
        name: 'X',
        botToken: 'tok',
        chatId: 'c',
        eventTypes: ['ISSUE_CREATED'],
        isEnabled: true,
        parseMode: 'Markdown',
      };
      const result = (await service.create(
        'proj-1',
        'user-1',
        dto,
      )) as Record<string, unknown>;

      expect(repo.create).toHaveBeenCalled();
      expect(result.botToken).toBeUndefined();
    });

    it('encrypts the bot token at rest', async () => {
      repo.findByProjectId.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseConfig());

      const dto: CreateTelegramConfigInput = {
        name: 'X',
        botToken: '1234567890:ABCdefGHIJklmnoPQRstuVWXyz',
        chatId: 'c',
        eventTypes: ['ISSUE_CREATED'],
        isEnabled: true,
        parseMode: 'Markdown',
      };
      await service.create('proj-1', 'user-1', dto);

      const stored = repo.create.mock.calls[0][0].botToken as string;
      expect(stored).not.toBe(dto.botToken);
      expect(encryption.isEncrypted(stored)).toBe(true);
      expect(encryption.decrypt(stored)).toBe(dto.botToken);
    });
  });

  describe('update', () => {
    it('resets disable fields when re-enabling', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig({ isEnabled: false }));
      repo.updateByProjectId.mockResolvedValue(baseConfig({ isEnabled: true }));

      await service.update('proj-1', {
        isEnabled: true,
      } satisfies UpdateTelegramConfigInput);

      expect(repo.updateByProjectId).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          isEnabled: true,
          disabledAt: null,
          disabledReason: null,
          consecutiveFailures: 0,
        }),
      );
    });

    it('does not reset disable fields when disabling', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig({ isEnabled: true }));
      repo.updateByProjectId.mockResolvedValue(baseConfig({ isEnabled: false }));

      await service.update('proj-1', {
        isEnabled: false,
      } satisfies UpdateTelegramConfigInput);

      const patch = repo.updateByProjectId.mock.calls[0][1];
      expect(patch.disabledAt).toBeUndefined();
    });

    it('encrypts the bot token when it is updated', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());
      repo.updateByProjectId.mockResolvedValue(baseConfig());

      await service.update('proj-1', {
        botToken: '9876543210:newTOKENvalueXYZ',
      } satisfies UpdateTelegramConfigInput);

      const stored = repo.updateByProjectId.mock.calls[0][1]
        .botToken as string;
      expect(stored).not.toBe('9876543210:newTOKENvalueXYZ');
      expect(encryption.decrypt(stored)).toBe('9876543210:newTOKENvalueXYZ');
    });

    it('leaves the stored bot token untouched when not in the patch', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());
      repo.updateByProjectId.mockResolvedValue(baseConfig());

      await service.update('proj-1', {
        name: 'Renamed',
      } satisfies UpdateTelegramConfigInput);

      expect(repo.updateByProjectId.mock.calls[0][1]).not.toHaveProperty(
        'botToken',
      );
    });
  });

  describe('remove', () => {
    it('deletes after existence check', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());

      await service.remove('proj-1');

      expect(repo.deleteByProjectId).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('test', () => {
    it('returns id+name and a test message', async () => {
      repo.findByProjectId.mockResolvedValue(baseConfig());

      const result = await service.test('proj-1');

      expect(result.config.id).toBe('tg-1');
      expect(result.testMessage).toBeDefined();
    });
  });
});
