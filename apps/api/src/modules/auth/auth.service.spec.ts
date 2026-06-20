import { Test, TestingModule } from '@nestjs/testing';
import { UnauthenticatedError, PermissionDeniedError, ValidationError } from '@/common/errors/domain.errors';
import { InviteStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenIssuerService } from './token-issuer.service';
import { InvitesRepository } from '@/modules/users/invites.repository';
import { UsersRepository } from '@/modules/users/users.repository';
import { authConfig } from '@/config';
import {
  mockAuthConfig,
  buildUser,
  buildRefreshToken,
  buildInvite,
} from '@test/helpers';

jest.mock('bcrypt');
const bcryptCompare = bcrypt.compare as jest.Mock;
const bcryptHash = bcrypt.hash as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: Record<string, jest.Mock>;
  let refreshTokensRepo: Record<string, jest.Mock>;
  let invitesRepo: Record<string, jest.Mock>;
  let tokenIssuer: {
    issueSession: jest.Mock;
    hashRefreshToken: jest.Mock;
    signAccessToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };

  beforeEach(async () => {
    tokenIssuer = {
      issueSession: jest.fn().mockResolvedValue({
        accessToken: 'access-token-stub',
        refreshToken: 'refresh-token-stub',
      }),
      // Real SHA-256 so refresh/logout lookups hash exactly as production does.
      hashRefreshToken: jest.fn((raw: string) =>
        crypto.createHash('sha256').update(raw).digest('hex'),
      ),
      signAccessToken: jest.fn().mockReturnValue('access-token-stub'),
      // The refresh cookie's jti IS the raw token in these tests.
      verifyRefreshToken: jest.fn((cookie: string) => cookie),
    };
    bcryptHash.mockResolvedValue('$2b$12$hashed');

    refreshTokensRepo = {
      findActiveByHash: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      revokeById: jest.fn().mockResolvedValue(undefined),
      revokeIfActive: jest.fn().mockResolvedValue(true),
      revokeByHash: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    invitesRepo = {
      findByToken: jest.fn().mockResolvedValue(null),
      setExpired: jest.fn().mockResolvedValue(undefined),
      acceptAtomic: jest.fn(),
    };

    usersRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByEmailWithPasswordHash: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersRepository, useValue: usersRepo },
        { provide: RefreshTokensRepository, useValue: refreshTokensRepo },
        { provide: InvitesRepository, useValue: invitesRepo },
        { provide: TokenIssuerService, useValue: tokenIssuer },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // --- login ---

  describe('login', () => {
    const dto = { email: 'user@test.local', password: 'password123' };

    const mockLogin = (user: ReturnType<typeof buildUser>) => {
      usersRepo.findByEmailWithPasswordHash.mockResolvedValue({
        user,
        passwordHash: user.passwordHash,
      });
    };

    it('should return tokens and user on valid credentials', async () => {
      const user = buildUser({ email: dto.email });
      mockLogin(user);
      bcryptCompare.mockResolvedValue(true);

      const result = await service.login(dto);

      expect(result.accessToken).toBe('access-token-stub');
      expect(result.refreshToken).toBe('refresh-token-stub');
      expect(result.user.email).toBe(dto.email);
      // Token minting is delegated to TokenIssuerService (its own spec asserts
      // the access payload, sha256 hashing and refresh persistence).
      expect(tokenIssuer.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: user.id, email: user.email, role: user.role }),
        undefined,
        undefined,
      );
    });

    it('should throw UnauthenticatedError if user not found', async () => {
      usersRepo.findByEmailWithPasswordHash.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthenticatedError);
    });

    it('should throw UnauthenticatedError if user has no password', async () => {
      const user = buildUser({ passwordHash: null });
      mockLogin(user);

      await expect(service.login(dto)).rejects.toThrow(UnauthenticatedError);
    });

    it('should throw PermissionDeniedError if user is deleted', async () => {
      const user = buildUser({ deletedAt: new Date() });
      mockLogin(user);

      await expect(service.login(dto)).rejects.toThrow(PermissionDeniedError);
    });

    it('should throw PermissionDeniedError if user is blocked', async () => {
      const user = buildUser({ isBlocked: true });
      mockLogin(user);

      await expect(service.login(dto)).rejects.toThrow(PermissionDeniedError);
    });

    it('should include block reason in error message', async () => {
      const user = buildUser({ isBlocked: true, blockReason: 'spam' });
      mockLogin(user);

      await expect(service.login(dto)).rejects.toThrow('Account blocked: spam');
    });

    it('should throw UnauthenticatedError on wrong password', async () => {
      const user = buildUser();
      mockLogin(user);
      bcryptCompare.mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthenticatedError);
    });
  });

  // --- refreshTokens ---

  describe('refreshTokens', () => {
    const userId = 'user-id-1';
    const rawToken = 'raw-refresh-token';

    it('should rotate tokens on valid refresh', async () => {
      const record = buildRefreshToken({ userId, revokedAt: null });
      const user = buildUser({ id: userId });

      refreshTokensRepo.findActiveByHash.mockResolvedValue(record);
      usersRepo.findById.mockResolvedValue(user);

      const result = await service.refreshTokens(userId, rawToken);

      expect(result.accessToken).toBe('access-token-stub');
      expect(result.refreshToken).toBeDefined();
      expect(refreshTokensRepo.revokeIfActive).toHaveBeenCalledWith(record.id);
    });

    it('should revoke all sessions when concurrent refresh loses the atomic claim', async () => {
      const record = buildRefreshToken({ userId, revokedAt: null });

      refreshTokensRepo.findActiveByHash.mockResolvedValue(record);
      refreshTokensRepo.revokeIfActive.mockResolvedValue(false);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow('Refresh token reuse detected');

      expect(refreshTokensRepo.revokeAllForUser).toHaveBeenCalledWith(userId);
      expect(refreshTokensRepo.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthenticatedError if no matching token', async () => {
      refreshTokensRepo.findActiveByHash.mockResolvedValue(null);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(UnauthenticatedError);
    });

    it('should reject refresh for a soft-deleted user', async () => {
      const record = buildRefreshToken({ userId, revokedAt: null });
      refreshTokensRepo.findActiveByHash.mockResolvedValue(record);
      usersRepo.findById.mockResolvedValue(buildUser({ id: userId, deletedAt: new Date() }));

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(PermissionDeniedError);
      expect(refreshTokensRepo.create).not.toHaveBeenCalled();
    });

    it('should revoke all sessions on reuse of revoked token', async () => {
      const revokedRecord = buildRefreshToken({
        userId,
        revokedAt: new Date(Date.now() - 1000),
      });
      refreshTokensRepo.findActiveByHash.mockResolvedValue(revokedRecord);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(UnauthenticatedError);

      expect(refreshTokensRepo.revokeAllForUser).toHaveBeenCalledWith(userId);
    });

    it('should throw UnauthenticatedError and revoke if token is expired', async () => {
      const expiredRecord = buildRefreshToken({
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      refreshTokensRepo.findActiveByHash.mockResolvedValue(expiredRecord);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(UnauthenticatedError);

      expect(refreshTokensRepo.revokeById).toHaveBeenCalledWith(expiredRecord.id);
    });

    it('should throw PermissionDeniedError if user is blocked', async () => {
      const record = buildRefreshToken({ userId, revokedAt: null });
      const blockedUser = buildUser({ id: userId, isBlocked: true });

      refreshTokensRepo.findActiveByHash.mockResolvedValue(record);
      usersRepo.findById.mockResolvedValue(blockedUser);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('should throw UnauthenticatedError if user not found', async () => {
      const record = buildRefreshToken({ userId, revokedAt: null });

      refreshTokensRepo.findActiveByHash.mockResolvedValue(record);
      usersRepo.findById.mockResolvedValue(null);

      await expect(
        service.refreshTokens(userId, rawToken),
      ).rejects.toThrow(UnauthenticatedError);
    });
  });

  // --- logout ---

  describe('logout', () => {
    it('should revoke matching token by hash', async () => {
      await service.logout('user-id', 'raw-token');

      expect(refreshTokensRepo.revokeByHash).toHaveBeenCalledWith(
        'user-id',
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
    });

    it('should not throw if no token matches', async () => {
      await expect(
        service.logout('user-id', 'invalid-token'),
      ).resolves.not.toThrow();
    });

    it('does not revoke when the refresh cookie is invalid/expired', async () => {
      tokenIssuer.verifyRefreshToken.mockReturnValue(null);
      await service.logout('user-id', 'tampered-cookie');
      expect(refreshTokensRepo.revokeByHash).not.toHaveBeenCalled();
    });

    it('does nothing when no refresh cookie is present', async () => {
      await service.logout('user-id', undefined);
      expect(tokenIssuer.verifyRefreshToken).not.toHaveBeenCalled();
      expect(refreshTokensRepo.revokeByHash).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should revoke all user tokens', async () => {
      await service.logoutAll('user-id');

      expect(refreshTokensRepo.revokeAllForUser).toHaveBeenCalledWith('user-id');
    });
  });

  // --- acceptInvite ---

  describe('acceptInvite', () => {
    const dto = {
      token: '550e8400-e29b-41d4-a716-446655440000',
      name: 'New User',
      password: 'securePassword123',
    };

    it('should create user and accept invite', async () => {
      const invite = buildInvite({ token: dto.token });
      const newUser = buildUser({ email: invite.email, name: dto.name });

      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: InviteStatus.PENDING,
        expiresAt: invite.expiresAt,
        inviterName: 'Test Inviter',
      });
      usersRepo.findByEmail.mockResolvedValue(null);
      invitesRepo.acceptAtomic.mockResolvedValue({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
      });

      const result = await service.acceptInvite(dto);

      expect(result.accessToken).toBe('access-token-stub');
      expect(result.user.name).toBe(dto.name);
    });

    it('should throw ValidationError if invite not found', async () => {
      invitesRepo.findByToken.mockResolvedValue(null);

      await expect(service.acceptInvite(dto)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if invite already accepted', async () => {
      const invite = buildInvite({ status: 'ACCEPTED' });
      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: InviteStatus.ACCEPTED,
        expiresAt: invite.expiresAt,
        inviterName: 'Test Inviter',
      });

      await expect(service.acceptInvite(dto)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if invite revoked', async () => {
      const invite = buildInvite({ status: 'REVOKED' });
      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: InviteStatus.REVOKED,
        expiresAt: invite.expiresAt,
        inviterName: 'Test Inviter',
      });

      await expect(service.acceptInvite(dto)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if invite expired', async () => {
      const invite = buildInvite({
        expiresAt: new Date(Date.now() - 1000),
      });
      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: InviteStatus.PENDING,
        expiresAt: invite.expiresAt,
        inviterName: 'Test Inviter',
      });

      await expect(service.acceptInvite(dto)).rejects.toThrow(ValidationError);
      expect(invitesRepo.setExpired).toHaveBeenCalledWith(invite.id);
    });

    it('should throw ValidationError if user already exists', async () => {
      const invite = buildInvite();
      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: InviteStatus.PENDING,
        expiresAt: invite.expiresAt,
        inviterName: 'Test Inviter',
      });
      usersRepo.findByEmail.mockResolvedValue(buildUser());

      await expect(service.acceptInvite(dto)).rejects.toThrow(ValidationError);
    });
  });

  // --- validateInviteToken ---

  describe('validateInviteToken', () => {
    function mockInvite(overrides: {
      status: InviteStatus;
      expiresAt?: Date;
    }) {
      const invite = buildInvite();
      invitesRepo.findByToken.mockResolvedValue({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: overrides.status,
        expiresAt: overrides.expiresAt ?? invite.expiresAt,
        inviterName: 'Test Inviter',
      });
      return invite;
    }

    it('should return valid result with email and inviterName for active invite', async () => {
      const invite = mockInvite({ status: InviteStatus.PENDING });

      const result = await service.validateInviteToken(invite.token);

      expect(result).toEqual({
        valid: true,
        email: invite.email,
        inviterName: 'Test Inviter',
      });
    });

    it('should return reason "invalid" for non-existent invite', async () => {
      invitesRepo.findByToken.mockResolvedValue(null);

      const result = await service.validateInviteToken('invalid');

      expect(result).toEqual({ valid: false, reason: 'invalid' });
    });

    it('should return reason "expired" and mark expired for a PENDING-but-elapsed invite', async () => {
      const invite = mockInvite({
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.validateInviteToken(invite.token);

      expect(result).toEqual({ valid: false, reason: 'expired' });
      expect(invitesRepo.setExpired).toHaveBeenCalledWith(invite.id);
    });

    it('should return reason "used" for an already-accepted invite', async () => {
      const invite = mockInvite({ status: InviteStatus.ACCEPTED });

      const result = await service.validateInviteToken(invite.token);

      expect(result).toEqual({ valid: false, reason: 'used' });
    });

    it('should return reason "revoked" for a revoked invite', async () => {
      const invite = mockInvite({ status: InviteStatus.REVOKED });

      const result = await service.validateInviteToken(invite.token);

      expect(result).toEqual({ valid: false, reason: 'revoked' });
    });

    it('should return reason "expired" for an EXPIRED-status invite', async () => {
      const invite = mockInvite({ status: InviteStatus.EXPIRED });

      const result = await service.validateInviteToken(invite.token);

      expect(result).toEqual({ valid: false, reason: 'expired' });
    });
  });
});
