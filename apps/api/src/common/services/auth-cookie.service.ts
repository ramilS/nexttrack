import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Response } from 'express';
import { appConfig, authConfig } from '@/config';

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
}

@Injectable()
export class AuthCookieService {
  private readonly refreshCookieOptions: CookieOptions;
  private readonly accessCookieOptions: CookieOptions;

  constructor(
    @Inject(appConfig.KEY) private app: ConfigType<typeof appConfig>,
    @Inject(authConfig.KEY) private auth: ConfigType<typeof authConfig>,
  ) {
    this.refreshCookieOptions = {
      httpOnly: true,
      secure: this.app.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.auth.refreshExpiresInDays * 24 * 60 * 60 * 1000,
    };
    this.accessCookieOptions = {
      httpOnly: true,
      secure: this.app.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: this.parseExpiresIn(this.auth.accessExpiresIn),
    };
  }

  setTokens(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie('refresh_token', refreshToken, this.refreshCookieOptions);
    res.cookie('access_token', accessToken, this.accessCookieOptions);
  }

  clearTokens(res: Response): void {
    const { maxAge: _r, ...refreshClearOptions } = this.refreshCookieOptions;
    const { maxAge: _a, ...accessClearOptions } = this.accessCookieOptions;
    res.clearCookie('refresh_token', refreshClearOptions);
    res.clearCookie('access_token', accessClearOptions);
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 15 * 60 * 1000;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return num * (multipliers[unit] ?? 60_000);
  }
}
