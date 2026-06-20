import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '@/common/errors/domain.errors';
import { SsoProvidersService } from './sso-providers.service';
import { SsoRepository } from './sso.repository';
import { EncryptionService } from '@/common/services/encryption.service';
import type { CreateSsoProviderParsed, SsoProvider } from '@repo/shared/schemas';

const mockEncryption = {
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
};

const now = new Date().toISOString();

const mockProvider = (overrides?: Partial<SsoProvider>): SsoProvider => ({
  id: 'provider-1',
  name: 'Google Corp',
  type: 'GOOGLE',
  isEnabled: false,
  clientId: 'google-client-id',
  clientSecret: '••••••••',
  allowedDomain: 'example.com',
  provisioningPolicy: 'INVITE_ONLY',
  defaultRole: 'USER',
  attributeMapping: null,
  connectionsCount: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('SsoProvidersService', () => {
  let service: SsoProvidersService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    repo = {
      createProvider: jest.fn(),
      findAllProviders: jest.fn().mockResolvedValue([]),
      findProviderById: jest.fn().mockResolvedValue(null),
      findProviderRawById: jest.fn().mockResolvedValue(null),
      findPublicEnabled: jest.fn().mockResolvedValue([]),
      updateProvider: jest.fn(),
      setProviderEnabled: jest.fn(),
      deleteProvider: jest.fn().mockResolvedValue(undefined),
      findProviderConnectionsPage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoProvidersService,
        { provide: SsoRepository, useValue: repo },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get(SsoProvidersService);
  });

  describe('create', () => {
    const dto: CreateSsoProviderParsed = {
      name: 'Google Corp',
      type: 'GOOGLE',
      clientId: 'google-client-id',
      clientSecret: 'my-secret',
      allowedDomain: 'example.com',
      provisioningPolicy: 'INVITE_ONLY',
      defaultRole: 'USER',
    };

    it('should encrypt clientSecret before storing', async () => {
      repo.createProvider.mockResolvedValue(mockProvider());

      await service.create('admin-1', dto);

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('my-secret');
      expect(repo.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({ clientSecret: 'encrypted' }),
      );
    });
  });

  describe('findAll', () => {
    it('should return masked providers', async () => {
      repo.findAllProviders.mockResolvedValue([mockProvider()]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].clientSecret).toBe('••••••••');
    });
  });

  describe('findById', () => {
    it('should return provider when found', async () => {
      repo.findProviderById.mockResolvedValue(mockProvider());

      const result = await service.findById('provider-1');

      expect(result.id).toBe('provider-1');
    });

    it('should throw NotFoundError when missing', async () => {
      repo.findProviderById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('should encrypt new clientSecret when present', async () => {
      repo.findProviderRawById.mockResolvedValue({ id: 'provider-1' });
      repo.updateProvider.mockResolvedValue(mockProvider());

      await service.update('provider-1', { clientSecret: 'new-secret' });

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('new-secret');
      expect(repo.updateProvider).toHaveBeenCalledWith(
        'provider-1',
        expect.objectContaining({ clientSecret: 'encrypted' }),
      );
    });

    it('should throw NotFoundError when provider missing', async () => {
      repo.findProviderRawById.mockResolvedValue(null);

      await expect(service.update('missing', {})).rejects.toThrow(NotFoundError);
    });
  });

  describe('enable', () => {
    it('should enable a provider with complete config', async () => {
      repo.findProviderRawById.mockResolvedValue({
        clientId: 'x',
        clientSecret: 'y',
        allowedDomain: 'z.com',
      });
      repo.setProviderEnabled.mockResolvedValue(mockProvider({ isEnabled: true }));

      const result = await service.enable('provider-1');

      expect(result.isEnabled).toBe(true);
    });

    it('should throw ValidationError when clientId or clientSecret missing', async () => {
      repo.findProviderRawById.mockResolvedValue({
        clientId: '',
        clientSecret: '',
        allowedDomain: 'z.com',
      });

      await expect(service.enable('provider-1')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when allowedDomain missing', async () => {
      repo.findProviderRawById.mockResolvedValue({
        clientId: 'x',
        clientSecret: 'y',
        allowedDomain: '',
      });

      await expect(service.enable('provider-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('disable', () => {
    it('should disable provider', async () => {
      repo.findProviderRawById.mockResolvedValue({ id: 'provider-1' });
      repo.setProviderEnabled.mockResolvedValue(mockProvider({ isEnabled: false }));

      const result = await service.disable('provider-1');

      expect(result.isEnabled).toBe(false);
    });
  });

  describe('remove', () => {
    it('should delete provider with no connections', async () => {
      repo.findProviderById.mockResolvedValue(mockProvider({ connectionsCount: 0 }));

      await service.remove('provider-1');

      expect(repo.deleteProvider).toHaveBeenCalledWith('provider-1');
    });

    it('should reject delete with existing connections', async () => {
      repo.findProviderById.mockResolvedValue(mockProvider({ connectionsCount: 5 }));

      await expect(service.remove('provider-1')).rejects.toThrow(ConflictError);
    });

    it('should throw NotFoundError when missing', async () => {
      repo.findProviderById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findConnections', () => {
    it('should delegate to repo', async () => {
      const result = { items: [], meta: { total: 0, page: 1, perPage: 20, totalPages: 0 } };
      repo.findProviderConnectionsPage.mockResolvedValue(result);

      const out = await service.findConnections('provider-1', 1, 20);

      expect(out).toBe(result);
    });
  });
});
