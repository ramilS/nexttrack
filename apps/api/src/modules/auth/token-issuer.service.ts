import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { authConfig } from '@/config';
import { RefreshTokensRepository } from './refresh-tokens.repository';

export interface AccessTokenSubject {
  id: string;
  email: string;
  role: string;
}

/**
 * Single owner of session-token minting. Both local login (`AuthService`) and
 * SSO (`SsoService`) issue sessions through here so the refresh-token format,
 * hashing and expiry can never drift between the two entry points — the hashing
 * in particular MUST match between issuance (store) and verification (lookup).
 */
@Injectable()
export class TokenIssuerService {
  constructor(
    private refreshTokensRepo: RefreshTokensRepository,
    private jwt: JwtService,
    @Inject(authConfig.KEY)
    private auth: ConfigType<typeof authConfig>,
  ) {}

  /** SHA-256 hex of the raw refresh token — the one hash used to both persist
   * and look the token up. Refresh tokens are 64 random bytes, so a fast hash
   * is sufficient (bcrypt is reserved for low-entropy passwords). */
  hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  signAccessToken(user: AccessTokenSubject): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  /** Verifies a refresh JWT and returns its jti (the raw token), or null when
   * the token is missing/invalid/expired. */
  verifyRefreshToken(token: string): string | null {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.auth.refreshSecret,
      }) as { jti?: string };
      return payload.jti ?? null;
    } catch {
      return null;
    }
  }

  /** Issues an access + refresh token pair, persisting the hashed refresh token. */
  async issueSession(
    user: AccessTokenSubject,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(user);

    const rawToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.auth.refreshExpiresInDays);

    await this.refreshTokensRepo.create({
      userId: user.id,
      token: this.hashRefreshToken(rawToken),
      userAgent,
      ipAddress,
      expiresAt,
    });

    const refreshToken = this.jwt.sign(
      { sub: user.id, jti: rawToken },
      {
        secret: this.auth.refreshSecret,
        expiresIn: `${this.auth.refreshExpiresInDays}d`,
      },
    );

    return { accessToken, refreshToken };
  }
}
