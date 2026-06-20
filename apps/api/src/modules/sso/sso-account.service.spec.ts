import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from '@/common/errors/domain.errors';
import { SsoAccountService } from './sso-account.service';
import { SsoRepository } from './sso.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { EncryptionService } from '@/common/services/encryption.service';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { appConfig } from '@/config';

describe('SsoAccountService', () => {
  let service: SsoAccountService;
  let ssoRepo: Record<string, jest.Mock>;
  let usersRepo: Record<string, jest.Mock>;

  const mockGoogleProvider = {
    exchangeCode: jest.fn(),
    getUserInfo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    ssoRepo = {
      findProviderRawById: jest.fn().mockResolvedValue(null),
      findConnectionByUserAndProvider: jest.fn().mockResolvedValue(null),
      createConnection: jest.fn().mockResolvedValue(undefined),
      countConnectionsExcept: jest.fn().mockResolvedValue(0),
      deleteConnections: jest.fn().mockResolvedValue(undefined),
      findUserConnections: jest.fn().mockResolvedValue([]),
    };

    usersRepo = {
      findHasPasswordById: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAccountService,
        { provide: SsoRepository, useValue: ssoRepo },
        { provide: UsersReader, useValue: usersRepo },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn().mockReturnValue('secret') } },
        { provide: appConfig.KEY, useValue: { apiUrl: 'http://api', webUrl: 'http://web' } },
        { provide: GoogleProvider, useValue: mockGoogleProvider },
        { provide: MicrosoftProvider, useValue: {} },
      ],
    }).compile();

    service = module.get(SsoAccountService);
  });

  describe('connectToExistingAccount', () => {
    const provider = {
      id: 'p1',
      type: 'GOOGLE',
      isEnabled: true,
      clientId: 'cid',
      clientSecret: 'encrypted',
      allowedDomain: 'example.com',
    };

    it('should create a connection for a verified matching domain', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue(provider);
      mockGoogleProvider.exchangeCode.mockResolvedValue({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
      });
      mockGoogleProvider.getUserInfo.mockResolvedValue({
        sub: 'ext-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User',
      });

      const result = await service.connectToExistingAccount('u1', 'p1', 'code');

      expect(result).toEqual({ connected: true });
      expect(ssoRepo.createConnection).toHaveBeenCalledWith({
        userId: 'u1',
        providerId: 'p1',
        externalId: 'ext-1',
        email: 'user@example.com',
      });
    });

    it('should throw when provider is disabled or missing', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue(null);

      await expect(
        service.connectToExistingAccount('u1', 'p1', 'code'),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject when already connected to this provider', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue(provider);
      ssoRepo.findConnectionByUserAndProvider.mockResolvedValue({ id: 'conn-1' });

      await expect(
        service.connectToExistingAccount('u1', 'p1', 'code'),
      ).rejects.toThrow(ValidationError);
      expect(ssoRepo.createConnection).not.toHaveBeenCalled();
    });

    it('should reject when email domain does not match provider', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue(provider);
      mockGoogleProvider.exchangeCode.mockResolvedValue({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
      });
      mockGoogleProvider.getUserInfo.mockResolvedValue({
        sub: 'ext-1',
        email: 'user@other.com',
        emailVerified: true,
        name: 'User',
      });

      await expect(
        service.connectToExistingAccount('u1', 'p1', 'code'),
      ).rejects.toThrow(ValidationError);
      expect(ssoRepo.createConnection).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should delete connections when user has password', async () => {
      usersRepo.findHasPasswordById.mockResolvedValue(true);

      await service.disconnect('u1', 'p1');

      expect(ssoRepo.deleteConnections).toHaveBeenCalledWith('u1', 'p1');
    });

    it('should reject disconnect if no password and no other connections', async () => {
      usersRepo.findHasPasswordById.mockResolvedValue(false);
      ssoRepo.countConnectionsExcept.mockResolvedValue(0);

      await expect(service.disconnect('u1', 'p1')).rejects.toThrow(ValidationError);
    });

    it('should allow disconnect if no password but other connections exist', async () => {
      usersRepo.findHasPasswordById.mockResolvedValue(false);
      ssoRepo.countConnectionsExcept.mockResolvedValue(1);

      await service.disconnect('u1', 'p1');

      expect(ssoRepo.deleteConnections).toHaveBeenCalledWith('u1', 'p1');
    });
  });

  describe('getUserConnections', () => {
    it('should delegate to repo', async () => {
      const connections = [{ id: 'c1' }];
      ssoRepo.findUserConnections.mockResolvedValue(connections);

      const result = await service.getUserConnections('u1');

      expect(result).toBe(connections);
    });
  });
});
