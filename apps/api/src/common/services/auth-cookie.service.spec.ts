import { ConfigType } from '@nestjs/config';
import { Response } from 'express';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { appConfig, authConfig } from '@/config';
import { mockAppConfig, mockAuthConfig } from '@test/helpers';

type AppConfigType = ConfigType<typeof appConfig>;
type AuthConfigType = ConfigType<typeof authConfig>;

interface ResponseMock {
  response: Response;
  cookie: jest.Mock;
  clearCookie: jest.Mock;
}

/**
 * Builds a typed Response test double exposing jest mocks for the only two
 * methods the service uses. The single `as Response` is the boundary cast for
 * a partial Express object — no `as any` / `as unknown as`.
 */
const buildResponseMock = (): ResponseMock => {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const partial: Partial<Response> = { cookie, clearCookie };
  return { response: partial as Response, cookie, clearCookie };
};

const buildAppConfig = (overrides: Partial<AppConfigType> = {}): AppConfigType => ({
  ...mockAppConfig,
  ...overrides,
});

const buildAuthConfig = (overrides: Partial<AuthConfigType> = {}): AuthConfigType => ({
  ...mockAuthConfig,
  ...overrides,
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('AuthCookieService', () => {
  describe('setTokens', () => {
    it('sets both refresh_token and access_token cookies', () => {
      const service = new AuthCookieService(buildAppConfig(), buildAuthConfig());
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      expect(cookie).toHaveBeenCalledTimes(2);
      expect(cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-jwt',
        expect.any(Object),
      );
      expect(cookie).toHaveBeenCalledWith(
        'access_token',
        'access-jwt',
        expect.any(Object),
      );
    });

    it('sets the refresh cookie with httpOnly, strict sameSite, /api/auth path and day-based maxAge', () => {
      const service = new AuthCookieService(
        buildAppConfig(),
        buildAuthConfig({ refreshExpiresInDays: 7 }),
      );
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      expect(cookie).toHaveBeenCalledWith('refresh_token', 'refresh-jwt', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * ONE_DAY_MS,
      });
    });

    it('sets the access cookie with httpOnly, lax sameSite, / path and parsed maxAge', () => {
      const service = new AuthCookieService(
        buildAppConfig(),
        buildAuthConfig({ accessExpiresIn: '15m' }),
      );
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      expect(cookie).toHaveBeenCalledWith('access_token', 'access-jwt', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000,
      });
    });

    it('marks cookies as secure only in production', () => {
      const service = new AuthCookieService(
        buildAppConfig({ nodeEnv: 'production' }),
        buildAuthConfig(),
      );
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      const [, , refreshOptions] = cookie.mock.calls[0];
      const [, , accessOptions] = cookie.mock.calls[1];
      expect(refreshOptions).toMatchObject({ secure: true });
      expect(accessOptions).toMatchObject({ secure: true });
    });

    it('does not mark cookies as secure outside production', () => {
      const service = new AuthCookieService(
        buildAppConfig({ nodeEnv: 'development' }),
        buildAuthConfig(),
      );
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      const [, , refreshOptions] = cookie.mock.calls[0];
      const [, , accessOptions] = cookie.mock.calls[1];
      expect(refreshOptions).toMatchObject({ secure: false });
      expect(accessOptions).toMatchObject({ secure: false });
    });

    it('computes refresh maxAge from refreshExpiresInDays', () => {
      const service = new AuthCookieService(
        buildAppConfig(),
        buildAuthConfig({ refreshExpiresInDays: 30 }),
      );
      const { response, cookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');

      const [, , refreshOptions] = cookie.mock.calls[0];
      expect(refreshOptions).toMatchObject({ maxAge: 30 * ONE_DAY_MS });
    });
  });

  describe('clearTokens', () => {
    it('clears both refresh_token and access_token cookies', () => {
      const service = new AuthCookieService(buildAppConfig(), buildAuthConfig());
      const { response, clearCookie } = buildResponseMock();

      service.clearTokens(response);

      expect(clearCookie).toHaveBeenCalledTimes(2);
      expect(clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
      expect(clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
    });

    it('clears the refresh cookie with the same attributes as set, minus maxAge', () => {
      const service = new AuthCookieService(buildAppConfig(), buildAuthConfig());
      const { response, clearCookie } = buildResponseMock();

      service.clearTokens(response);

      const [, refreshClearOptions] = clearCookie.mock.calls[0];
      expect(refreshClearOptions).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/auth',
      });
      expect(refreshClearOptions).not.toHaveProperty('maxAge');
    });

    it('clears the access cookie with the same attributes as set, minus maxAge', () => {
      const service = new AuthCookieService(buildAppConfig(), buildAuthConfig());
      const { response, clearCookie } = buildResponseMock();

      service.clearTokens(response);

      const [, accessClearOptions] = clearCookie.mock.calls[1];
      expect(accessClearOptions).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
      expect(accessClearOptions).not.toHaveProperty('maxAge');
    });

    it('keeps secure attribute parity with set in production (browsers reject mismatched clears)', () => {
      const service = new AuthCookieService(
        buildAppConfig({ nodeEnv: 'production' }),
        buildAuthConfig(),
      );
      const { response, cookie, clearCookie } = buildResponseMock();

      service.setTokens(response, 'access-jwt', 'refresh-jwt');
      service.clearTokens(response);

      const [, , refreshSetOptions] = cookie.mock.calls[0];
      const [, , accessSetOptions] = cookie.mock.calls[1];
      const [, refreshClearOptions] = clearCookie.mock.calls[0];
      const [, accessClearOptions] = clearCookie.mock.calls[1];

      // path / sameSite / secure must match between set and clear; only maxAge differs.
      const { maxAge: _refreshMaxAge, ...refreshSetWithoutMaxAge } = refreshSetOptions;
      const { maxAge: _accessMaxAge, ...accessSetWithoutMaxAge } = accessSetOptions;
      expect(refreshClearOptions).toEqual(refreshSetWithoutMaxAge);
      expect(accessClearOptions).toEqual(accessSetWithoutMaxAge);
      expect(refreshClearOptions).toMatchObject({ secure: true });
      expect(accessClearOptions).toMatchObject({ secure: true });
    });
  });

  describe('parseExpiresIn (via access cookie maxAge)', () => {
    const maxAgeFor = (accessExpiresIn: string): number => {
      const service = new AuthCookieService(
        buildAppConfig(),
        buildAuthConfig({ accessExpiresIn }),
      );
      const { response, cookie } = buildResponseMock();
      service.setTokens(response, 'access-jwt', 'refresh-jwt');
      const [, , accessOptions] = cookie.mock.calls[1];
      return accessOptions.maxAge;
    };

    it('parses seconds', () => {
      expect(maxAgeFor('30s')).toBe(30 * 1000);
    });

    it('parses minutes ("15m" -> 900000)', () => {
      expect(maxAgeFor('15m')).toBe(900000);
    });

    it('parses hours ("1h" -> 3600000)', () => {
      expect(maxAgeFor('1h')).toBe(3600000);
    });

    it('parses days ("7d" -> 604800000)', () => {
      expect(maxAgeFor('7d')).toBe(604800000);
    });

    it('handles multi-digit values', () => {
      expect(maxAgeFor('90m')).toBe(90 * 60 * 1000);
    });

    it('falls back to 15 minutes for malformed input (no unit)', () => {
      expect(maxAgeFor('15')).toBe(15 * 60 * 1000);
    });

    it('falls back to 15 minutes for an unsupported unit', () => {
      expect(maxAgeFor('1y')).toBe(15 * 60 * 1000);
    });

    it('falls back to 15 minutes for an empty string', () => {
      expect(maxAgeFor('')).toBe(15 * 60 * 1000);
    });

    it('falls back to 15 minutes for garbage input', () => {
      expect(maxAgeFor('abc')).toBe(15 * 60 * 1000);
    });

    it('falls back to 15 minutes when the unit precedes the number', () => {
      expect(maxAgeFor('m15')).toBe(15 * 60 * 1000);
    });
  });
});
