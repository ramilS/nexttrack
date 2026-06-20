import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { InviteStatus, GlobalRole } from '@prisma/client';
import { OidcUserInfo } from './providers/base-oidc.provider';
import { SsoRepository, SsoProviderRaw } from './sso.repository';
import { TokenIssuerService } from '@/modules/auth/token-issuer.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { InvitesRepository } from '@/modules/users/invites.repository';

interface TokenIssuanceUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface SsoSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  };
}

/**
 * Resolves an OIDC identity to a NextTrack session: existing-connection login,
 * linking to an existing account, auto-provisioning, and invite-only signup.
 * Split out of SsoService so the latter stays focused on the OAuth flow
 * (state, code exchange, redirect) rather than account lifecycle.
 */
@Injectable()
export class SsoProvisioningService {
  private readonly logger = new AppLogger(SsoProvisioningService.name);

  constructor(
    private ssoRepo: SsoRepository,
    private usersRepo: UsersRepository,
    private invitesRepo: InvitesRepository,
    private tokenIssuer: TokenIssuerService,
  ) {}

  async findOrCreateUser(
    provider: SsoProviderRaw,
    userInfo: OidcUserInfo,
    inviteToken: string | undefined,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<SsoSession> {
    // Path A: Existing connection
    const existingConnection = await this.ssoRepo.findConnectionByExternal(
      provider.id,
      userInfo.sub,
    );

    if (existingConnection) {
      const user = existingConnection.user;

      if (user.isBlocked) {
        this.logger.warn('SSO login blocked: blocked account', {
          userId: user.id,
          providerId: provider.id,
          ip: ipAddress,
        });
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_BLOCKED,
          'Account has been blocked',
        );
      }

      if (user.deletedAt) {
        this.logger.warn('SSO login blocked: deleted account', {
          userId: user.id,
          providerId: provider.id,
          ip: ipAddress,
        });
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_DELETED,
          'Account has been deleted',
        );
      }

      await this.ssoRepo.touchConnectionLastUsed(
        existingConnection.id,
        userInfo.email,
      );

      this.logger.log('SSO login succeeded (existing connection)', {
        userId: user.id,
        providerId: provider.id,
        ip: ipAddress,
      });

      return this.issueTokens(user, userAgent, ipAddress);
    }

    if (!userInfo.emailVerified) {
      throw new PermissionDeniedError(
        ErrorCode.SSO_EMAIL_UNVERIFIED,
        'Email must be verified by the identity provider',
      );
    }

    // Path B1: User exists by email, no connection yet
    const existingUser = await this.usersRepo.findByEmail(
      userInfo.email.toLowerCase(),
    );

    if (existingUser) {
      if (existingUser.isBlocked) {
        this.logger.warn('SSO link blocked: blocked account', {
          userId: existingUser.id,
          providerId: provider.id,
          ip: ipAddress,
        });
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_BLOCKED,
          'Account has been blocked',
        );
      }

      if (existingUser.deletedAt) {
        this.logger.warn('SSO link blocked: deleted account', {
          userId: existingUser.id,
          providerId: provider.id,
          ip: ipAddress,
        });
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_DELETED,
          'Account has been deleted',
        );
      }

      await this.ssoRepo.createConnection({
        userId: existingUser.id,
        providerId: provider.id,
        externalId: userInfo.sub,
        email: userInfo.email,
      });

      if (!existingUser.avatarUrl && userInfo.picture) {
        await this.usersRepo.update(existingUser.id, {
          avatarUrl: userInfo.picture,
        });
      }

      this.logger.log('SSO connection linked to existing account', {
        userId: existingUser.id,
        providerId: provider.id,
        ip: ipAddress,
      });

      return this.issueTokens(existingUser, userAgent, ipAddress);
    }

    // Path B2: No user found — check provisioning policy
    if (provider.provisioningPolicy === 'INVITE_ONLY') {
      return this.handleInviteOnlyProvisioning(
        provider,
        userInfo,
        inviteToken,
        userAgent,
        ipAddress,
      );
    }

    // AUTO_PROVISION
    const newUser = await this.ssoRepo.createUserWithConnection({
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture ?? null,
      role: provider.defaultRole,
      providerId: provider.id,
      externalId: userInfo.sub,
    });

    this.logger.log('SSO auto-provisioned new account', {
      userId: newUser.id,
      providerId: provider.id,
      role: provider.defaultRole,
      ip: ipAddress,
    });

    return this.issueTokens(newUser, userAgent, ipAddress);
  }

  private async handleInviteOnlyProvisioning(
    provider: SsoProviderRaw,
    userInfo: OidcUserInfo,
    inviteToken: string | undefined,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<SsoSession> {
    let invite: {
      id: string;
      email: string;
      role: GlobalRole;
      status: InviteStatus;
      expiresAt: Date;
    } | null = null;

    if (inviteToken) {
      invite = await this.invitesRepo.findByToken(inviteToken);
    }

    if (!invite) {
      invite = await this.invitesRepo.findFullPendingByEmail(
        userInfo.email.toLowerCase(),
      );
    }

    if (!invite) {
      throw new ValidationError(
        ErrorCode.SSO_NOT_INVITED,
        'You must be invited before signing in with SSO',
      );
    }

    if (invite.status !== InviteStatus.PENDING || invite.expiresAt < new Date()) {
      throw new ValidationError(
        ErrorCode.SSO_NOT_INVITED,
        'You must be invited before signing in with SSO',
      );
    }

    const newUser = await this.ssoRepo.acceptInviteWithSsoConnection({
      inviteId: invite.id,
      inviteEmail: invite.email,
      inviteRole: invite.role,
      name: userInfo.name,
      avatarUrl: userInfo.picture ?? null,
      providerId: provider.id,
      externalId: userInfo.sub,
      externalEmail: userInfo.email,
    });

    this.logger.log('SSO invite accepted: new account created', {
      userId: newUser.id,
      providerId: provider.id,
      inviteId: invite.id,
      role: invite.role,
      ip: ipAddress,
    });

    return this.issueTokens(newUser, userAgent, ipAddress);
  }

  private async issueTokens(
    user: TokenIssuanceUser,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<SsoSession> {
    const { accessToken, refreshToken } = await this.tokenIssuer.issueSession(
      user,
      userAgent,
      ipAddress,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
