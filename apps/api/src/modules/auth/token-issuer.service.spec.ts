import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { authConfig } from '@/config';
import { mockAuthConfig } from '@test/helpers';
import { TokenIssuerService } from './token-issuer.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

describe('TokenIssuerService', () => {
  let service: TokenIssuerService;
  let refreshTokensRepo: Record<string, jest.Mock>;
  let jwt: { sign: jest.Mock; verify: jest.Mock };

  const user = { id: 'user-1', email: 'user@test.local', role: 'USER' };

  beforeEach(async () => {
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    };
    refreshTokensRepo = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenIssuerService,
        { provide: RefreshTokensRepository, useValue: refreshTokensRepo },
        { provide: JwtService, useValue: jwt },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get(TokenIssuerService);
  });

  describe('hashRefreshToken', () => {
    it('returns the SHA-256 hex of the input (matches production hashing)', () => {
      const raw = 'a'.repeat(128);
      expect(service.hashRefreshToken(raw)).toBe(
        crypto.createHash('sha256').update(raw).digest('hex'),
      );
    });
  });

  describe('signAccessToken', () => {
    it('signs the access payload with sub/email/role', () => {
      service.signAccessToken(user);
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
    });
  });

  describe('verifyRefreshToken', () => {
    it('returns the jti from a valid refresh token', () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', jti: 'raw-1' });
      expect(service.verifyRefreshToken('cookie')).toBe('raw-1');
    });

    it('returns null when verification throws (invalid/expired)', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      expect(service.verifyRefreshToken('bad')).toBeNull();
    });
  });

  describe('issueSession', () => {
    it('persists the SHA-256 hash of the raw token, never the raw token', async () => {
      await service.issueSession(user, 'agent', '1.2.3.4');

      expect(refreshTokensRepo.create).toHaveBeenCalledTimes(1);
      const arg = refreshTokensRepo.create.mock.calls[0]![0] as {
        userId: string;
        token: string;
        userAgent?: string;
        ipAddress?: string;
        expiresAt: Date;
      };
      expect(arg.userId).toBe(user.id);
      expect(arg.token).toMatch(/^[a-f0-9]{64}$/);
      expect(arg.userAgent).toBe('agent');
      expect(arg.ipAddress).toBe('1.2.3.4');
      expect(arg.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('signs the refresh token with the refresh secret and a jti, and returns both tokens', async () => {
      jwt.sign.mockReturnValueOnce('access').mockReturnValueOnce('refresh');

      const result = await service.issueSession(user);

      expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
      expect(jwt.sign).toHaveBeenLastCalledWith(
        expect.objectContaining({ sub: user.id, jti: expect.any(String) }),
        expect.objectContaining({ secret: mockAuthConfig.refreshSecret }),
      );
    });
  });
});
