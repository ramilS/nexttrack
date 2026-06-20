import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PermissionDeniedError,
  UnauthenticatedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { InviteStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  LoginInput,
  AcceptInviteInput,
  InviteInvalidReason,
} from '@repo/shared/schemas';
import { authConfig } from '@/config';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { InvitesRepository } from '@/modules/users/invites.repository';
import { UsersRepository } from '@/modules/users/users.repository';

const BCRYPT_ROUNDS = 12;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersRepo: UsersRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private invitesRepo: InvitesRepository,
    private jwt: JwtService,
    @Inject(authConfig.KEY)
    private auth: ConfigType<typeof authConfig>,
  ) {}

  async login(dto: LoginInput, userAgent?: string, ipAddress?: string) {
    const found = await this.usersRepo.findByEmailWithPasswordHash(dto.email);

    if (!found || !found.passwordHash) {
      throw new UnauthenticatedError(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    const user = found.user;
    const passwordHash = found.passwordHash;

    if (user.deletedAt) {
      throw new PermissionDeniedError(
        ErrorCode.USER_DELETED,
        'Account has been deleted',
      );
    }

    if (user.isBlocked) {
      throw new PermissionDeniedError(
        ErrorCode.USER_BLOCKED,
        user.blockReason
          ? `Account blocked: ${user.blockReason}`
          : 'Account has been blocked',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, passwordHash);
    if (!passwordValid) {
      throw new UnauthenticatedError(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(
      user.id,
      userAgent,
      ipAddress,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async refreshTokens(
    userId: string,
    oldRefreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const tokenHash = sha256Hex(oldRefreshToken);
    const record = await this.refreshTokensRepo.findActiveByHash(userId, tokenHash);

    if (!record) {
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_INVALID,
        'Invalid refresh token',
      );
    }

    if (record.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${userId}; revoking all sessions`,
      );
      await this.logoutAll(userId);
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_INVALID,
        'Refresh token reuse detected',
      );
    }

    if (record.expiresAt < new Date()) {
      await this.refreshTokensRepo.revokeById(record.id);
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_EXPIRED,
        'Refresh token expired',
      );
    }

    const claimed = await this.refreshTokensRepo.revokeIfActive(record.id);
    if (!claimed) {
      this.logger.warn(
        `Refresh token reuse detected for user ${userId} (concurrent refresh); revoking all sessions`,
      );
      await this.logoutAll(userId);
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_INVALID,
        'Refresh token reuse detected',
      );
    }

    const user = await this.usersRepo.findById(userId);

    if (!user) {
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_INVALID,
        'User not found',
      );
    }

    if (user.isBlocked) {
      throw new PermissionDeniedError(
        ErrorCode.USER_BLOCKED,
        'Account has been blocked',
      );
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(
      user.id,
      userAgent,
      ipAddress,
    );

    return { accessToken, refreshToken };
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = sha256Hex(refreshToken);
    await this.refreshTokensRepo.revokeByHash(userId, tokenHash);
  }

  async logoutAll(userId: string) {
    await this.refreshTokensRepo.revokeAllForUser(userId);
  }

  async acceptInvite(
    dto: AcceptInviteInput,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const invite = await this.invitesRepo.findByToken(dto.token);

    if (!invite) {
      throw new ValidationError(
        ErrorCode.INVITE_INVALID,
        'Invalid invitation token',
      );
    }

    if (invite.status === InviteStatus.ACCEPTED) {
      throw new ValidationError(
        ErrorCode.INVITE_ALREADY_USED,
        'This invitation has already been used',
      );
    }

    if (invite.status === InviteStatus.REVOKED) {
      throw new ValidationError(
        ErrorCode.INVITE_INVALID,
        'This invitation has been revoked',
      );
    }

    if (invite.expiresAt < new Date()) {
      await this.invitesRepo.setExpired(invite.id);
      throw new ValidationError(
        ErrorCode.INVITE_EXPIRED,
        'This invitation has expired',
      );
    }

    const existingUser = await this.usersRepo.findByEmail(invite.email);

    if (existingUser) {
      throw new ValidationError(
        ErrorCode.USER_ALREADY_EXISTS,
        'User with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.invitesRepo.acceptAtomic(invite.id, {
      email: invite.email,
      name: dto.name,
      passwordHash,
      role: invite.role,
    });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(
      user.id,
      userAgent,
      ipAddress,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async validateInviteToken(
    token: string,
  ): Promise<
    | { valid: true; email: string; inviterName: string }
    | { valid: false; reason: InviteInvalidReason }
  > {
    const invite = await this.invitesRepo.findByToken(token);

    if (!invite) {
      return { valid: false, reason: 'invalid' };
    }
    if (invite.status === InviteStatus.ACCEPTED) {
      return { valid: false, reason: 'used' };
    }
    if (invite.status === InviteStatus.REVOKED) {
      return { valid: false, reason: 'revoked' };
    }
    if (invite.status === InviteStatus.EXPIRED) {
      return { valid: false, reason: 'expired' };
    }

    if (invite.expiresAt < new Date()) {
      await this.invitesRepo.setExpired(invite.id);
      return { valid: false, reason: 'expired' };
    }

    return {
      valid: true,
      email: invite.email,
      inviterName: invite.inviterName,
    };
  }

  private generateAccessToken(user: { id: string; email: string; role: string }) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async createRefreshToken(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const hashedToken = sha256Hex(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.auth.refreshExpiresInDays);

    await this.refreshTokensRepo.create({
      userId,
      token: hashedToken,
      userAgent,
      ipAddress,
      expiresAt,
    });

    return this.jwt.sign(
      { sub: userId, jti: rawToken },
      {
        secret: this.auth.refreshSecret,
        expiresIn: `${this.auth.refreshExpiresInDays}d`,
      },
    );
  }
}
