import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError } from '@/common/errors/domain.errors';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { SsoService } from './sso.service';
import { SsoProvisioningService } from './sso-provisioning.service';
import { SsoRepository } from './sso.repository';
import { RefreshTokensRepository } from '@/modules/auth/refresh-tokens.repository';
import { TokenIssuerService } from '@/modules/auth/token-issuer.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { InvitesRepository } from '@/modules/users/invites.repository';
import { PrismaService } from '@/prisma/prisma.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { EncryptionService } from '@/common/services/encryption.service';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { appConfig, authConfig, ssoConfig } from '@/config';
import { buildUser, createMockPrisma, mockAuthConfig } from '@test/helpers';

describe('SsoService', () => {
  let service: SsoService;
  let ssoRepo: Record<string, jest.Mock>;
  let refreshTokensRepo: Record<string, jest.Mock>;
  let usersRepo: Record<string, jest.Mock>;
  let invitesRepo: Record<string, jest.Mock>;
  let redis: Record<string, jest.Mock>;
  let jwt: { sign: jest.Mock };

  const mockGoogleProvider = {
    getAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/...'),
    exchangeCode: jest.fn(),
    getUserInfo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    ssoRepo = {
      findProviderRawById: jest.fn().mockResolvedValue(null),
      findConnectionByExternal: jest.fn().mockResolvedValue(null),
      touchConnectionLastUsed: jest.fn().mockResolvedValue(undefined),
      createConnection: jest.fn().mockResolvedValue(undefined),
      createUserWithConnection: jest.fn(),
      acceptInviteWithSsoConnection: jest.fn(),
    };

    refreshTokensRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    usersRepo = {
      update: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
    };

    invitesRepo = {
      findByToken: jest.fn().mockResolvedValue(null),
      findFullPendingByEmail: jest.fn().mockResolvedValue(null),
    };

    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('access-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoService,
        // Real provisioning service — resolves with the mocked repos + token
        // issuer, so handleCallback's provisioning paths are exercised as-is.
        SsoProvisioningService,
        { provide: PrismaService, useValue: createMockPrisma() },
        { provide: SsoRepository, useValue: ssoRepo },
        { provide: RefreshTokensRepository, useValue: refreshTokensRepo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: InvitesRepository, useValue: invitesRepo },
        { provide: ValkeyService, useValue: redis },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn().mockReturnValue('secret') } },
        { provide: JwtService, useValue: jwt },
        {
          provide: TokenIssuerService,
          useValue: {
            issueSession: jest
              .fn()
              .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
          },
        },
        { provide: appConfig.KEY, useValue: { apiUrl: 'http://api', webUrl: 'http://web' } },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
        { provide: ssoConfig.KEY, useValue: { stateTtl: 600, finalizeCodeTtl: 60 } },
        { provide: GoogleProvider, useValue: mockGoogleProvider },
        { provide: MicrosoftProvider, useValue: {} },
      ],
    }).compile();

    service = module.get(SsoService);
  });

  describe('generateAuthUrl', () => {
    it('should generate URL and store state in redis', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue({
        id: 'p1',
        type: 'GOOGLE',
        isEnabled: true,
        clientId: 'cid',
        allowedDomain: 'example.com',
      });

      const url = await service.generateAuthUrl('p1', '/projects');

      expect(url).toBe('https://accounts.google.com/...');
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_state:/),
        expect.any(String),
        600,
      );
    });

    it('should store a PKCE code verifier and pass the S256 challenge to the provider', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue({
        id: 'p1',
        type: 'GOOGLE',
        isEnabled: true,
        clientId: 'cid',
        allowedDomain: 'example.com',
      });

      await service.generateAuthUrl('p1');

      const storedStateJson = redis.set.mock.calls[0][1] as string;
      const storedState = JSON.parse(storedStateJson) as {
        codeVerifier?: string;
      };
      expect(storedState.codeVerifier).toEqual(expect.any(String));
      expect(storedState.codeVerifier!.length).toBeGreaterThanOrEqual(43);

      const expectedChallenge = crypto
        .createHash('sha256')
        .update(storedState.codeVerifier!)
        .digest('base64url');
      expect(mockGoogleProvider.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({ codeChallenge: expectedChallenge }),
      );
    });

    it('should generate a unique PKCE verifier per authorization request', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue({
        id: 'p1',
        type: 'GOOGLE',
        isEnabled: true,
        clientId: 'cid',
        allowedDomain: 'example.com',
      });

      await service.generateAuthUrl('p1');
      await service.generateAuthUrl('p1');

      const firstState = JSON.parse(redis.set.mock.calls[0][1] as string) as {
        codeVerifier: string;
      };
      const secondState = JSON.parse(redis.set.mock.calls[1][1] as string) as {
        codeVerifier: string;
      };
      expect(firstState.codeVerifier).not.toBe(secondState.codeVerifier);
    });

    it('should throw when provider disabled', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue({
        id: 'p1',
        type: 'GOOGLE',
        isEnabled: false,
      });

      await expect(service.generateAuthUrl('p1')).rejects.toThrow(ValidationError);
    });

    it('should throw when provider missing', async () => {
      ssoRepo.findProviderRawById.mockResolvedValue(null);

      await expect(service.generateAuthUrl('p1')).rejects.toThrow(ValidationError);
    });
  });

  describe('finalize', () => {
    it('should return finalize data and delete it from redis', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } }));

      const result = await service.finalize('code-x');

      expect(result.accessToken).toBe('a');
      expect(redis.del).toHaveBeenCalledWith('sso_finalize:code-x');
    });

    it('should throw when code is missing or expired', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.finalize('bad')).rejects.toThrow(ValidationError);
    });
  });

  describe('handleCallback email verification gate', () => {
    const provider = {
      id: 'p1',
      type: 'GOOGLE',
      isEnabled: true,
      clientId: 'cid',
      clientSecret: 'encrypted',
      allowedDomain: 'example.com',
      provisioningPolicy: 'AUTO_PROVISION',
      defaultRole: 'USER',
    };

    const setupCallback = (emailVerified: boolean) => {
      redis.get.mockResolvedValue(
        JSON.stringify({ providerId: 'p1', redirectTo: '/projects' }),
      );
      ssoRepo.findProviderRawById.mockResolvedValue(provider);
      mockGoogleProvider.exchangeCode.mockResolvedValue({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
      });
      mockGoogleProvider.getUserInfo.mockResolvedValue({
        sub: 'ext-1',
        email: 'victim@example.com',
        emailVerified,
        name: 'Victim',
      });
    };

    it('should reject auto-link to existing account when provider email is unverified', async () => {
      setupCallback(false);
      usersRepo.findByEmail.mockResolvedValue(buildUser({ email: 'victim@example.com' }));

      const result = await service.handleCallback('code', 'state');

      expect(result.redirectUrl).toContain('sso_error=SSO_EMAIL_UNVERIFIED');
      expect(ssoRepo.createConnection).not.toHaveBeenCalled();
      expect(ssoRepo.createUserWithConnection).not.toHaveBeenCalled();
    });

    it('should auto-link existing account when provider email is verified', async () => {
      setupCallback(true);
      usersRepo.findByEmail.mockResolvedValue(buildUser({ email: 'victim@example.com' }));

      const result = await service.handleCallback('code', 'state');

      expect(result.redirectUrl).toContain('/auth/sso/result?token=');
      expect(ssoRepo.createConnection).toHaveBeenCalled();
    });

    it('should still allow login via pre-existing connection regardless of verification flag', async () => {
      setupCallback(false);
      ssoRepo.findConnectionByExternal.mockResolvedValue({
        id: 'conn-1',
        user: buildUser({ email: 'victim@example.com' }),
      });

      const result = await service.handleCallback('code', 'state');

      expect(result.redirectUrl).toContain('/auth/sso/result?token=');
    });

    it('should pass the stored PKCE code verifier to exchangeCode', async () => {
      setupCallback(true);
      redis.get.mockResolvedValue(
        JSON.stringify({
          providerId: 'p1',
          redirectTo: '/projects',
          codeVerifier: 'stored-verifier-123',
        }),
      );
      ssoRepo.findConnectionByExternal.mockResolvedValue({
        id: 'conn-1',
        user: buildUser({ email: 'victim@example.com' }),
      });

      await service.handleCallback('code', 'state');

      expect(mockGoogleProvider.exchangeCode).toHaveBeenCalledWith(
        expect.objectContaining({ codeVerifier: 'stored-verifier-123' }),
      );
    });
  });
});
