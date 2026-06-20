import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { SsoProvidersService } from '@/modules/sso/sso-providers.service';
import { authConfig } from '@/config';
import { mockAuthConfig } from '@test/helpers';

type AuthServiceMethod =
  | 'login'
  | 'refreshTokens'
  | 'logout'
  | 'logoutAll'
  | 'acceptInvite'
  | 'validateInviteToken';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<AuthServiceMethod, jest.Mock>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let authCookie: { setTokens: jest.Mock; clearTokens: jest.Mock };

  const mockResponse = (): Response => {
    const res: Partial<Response> = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  const mockRequest = (overrides: Partial<Request> = {}): Request =>
    ({
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      cookies: {},
      user: {},
      ...overrides,
    }) as Request;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
      acceptInvite: jest.fn(),
      validateInviteToken: jest.fn(),
    };

    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    authCookie = {
      setTokens: jest.fn(),
      clearTokens: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuthCookieService, useValue: authCookie },
        { provide: SsoProvidersService, useValue: { findPublicEnabled: jest.fn().mockResolvedValue([]) } },
        { provide: JwtService, useValue: jwtService },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('refresh', () => {
    it('should call refreshTokens with id and raw token from req.user', async () => {
      const req = mockRequest({
        user: { id: 'user-1', refreshToken: 'raw-jti-token' },
      });
      const res = mockResponse();
      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh-jwt',
      });

      await controller.refresh(req, res);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'user-1',
        'raw-jti-token',
        'test-agent',
        '127.0.0.1',
      );
    });

    it('should set tokens via AuthCookieService', async () => {
      const req = mockRequest({
        user: { id: 'user-1', refreshToken: 'raw-jti-token' },
      });
      const res = mockResponse();
      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh-jwt',
      });

      await controller.refresh(req, res);

      expect(authCookie.setTokens).toHaveBeenCalledWith(
        res,
        'new-access',
        'new-refresh-jwt',
      );
    });
  });

  describe('logout', () => {
    it('should decode JWT cookie and pass jti to authService.logout', async () => {
      const req = mockRequest({
        cookies: { refresh_token: 'valid-jwt-cookie' },
      });
      const res = mockResponse();
      jwtService.verify.mockReturnValue({ jti: 'raw-token-inside-jwt' });

      await controller.logout('user-1', req, res);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-cookie', {
        secret: mockAuthConfig.refreshSecret,
      });
      expect(authService.logout).toHaveBeenCalledWith(
        'user-1',
        'raw-token-inside-jwt',
      );
    });

    it('should clear tokens even if JWT verification fails', async () => {
      const req = mockRequest({
        cookies: { refresh_token: 'corrupted-jwt' },
      });
      const res = mockResponse();
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await controller.logout('user-1', req, res);

      expect(authService.logout).not.toHaveBeenCalled();
      expect(authCookie.clearTokens).toHaveBeenCalledWith(res);
    });

    it('should clear tokens when no refresh_token cookie present', async () => {
      const req = mockRequest({ cookies: {} });
      const res = mockResponse();

      await controller.logout('user-1', req, res);

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(authService.logout).not.toHaveBeenCalled();
      expect(authCookie.clearTokens).toHaveBeenCalledWith(res);
    });
  });

  describe('login', () => {
    it('should set tokens in cookies and return user only', async () => {
      const res = mockResponse();
      const req = mockRequest();
      authService.login.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt-jwt',
        user: { id: 'u1', name: 'Test', email: 'test@t.local', role: 'USER', avatarUrl: null },
      });

      const result = await controller.login(
        { email: 'test@t.local', password: 'pass' },
        req,
        res,
      );

      expect(authCookie.setTokens).toHaveBeenCalledWith(res, 'at', 'rt-jwt');
      expect(result).toEqual({
        user: expect.objectContaining({ email: 'test@t.local' }),
      });
      expect(result).not.toHaveProperty('accessToken');
    });
  });

  describe('validateInvite', () => {
    it('maps a valid result to { valid: true, email, inviterName }', async () => {
      authService.validateInviteToken.mockResolvedValue({
        valid: true,
        email: 'invitee@t.local',
        inviterName: 'Admin',
      });

      const result = await controller.validateInvite('tok');

      expect(result).toEqual({
        valid: true,
        email: 'invitee@t.local',
        inviterName: 'Admin',
      });
    });

    it('maps an invalid result to { valid: false, reason }', async () => {
      authService.validateInviteToken.mockResolvedValue({
        valid: false,
        reason: 'used',
      });

      const result = await controller.validateInvite('tok');

      expect(result).toEqual({ valid: false, reason: 'used' });
    });
  });
});
