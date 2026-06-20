import { Inject, Injectable } from '@nestjs/common';
import {
  DomainError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { RedisService } from '@/redis/redis.service';
import { EncryptionService } from '@/common/services/encryption.service';
import { ErrorCode } from '@repo/shared/error-codes';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { BaseOidcProvider, OidcUserInfo } from './providers/base-oidc.provider';
import { InviteStatus, SsoProviderType } from '@prisma/client';
import { appConfig, authConfig, ssoConfig } from '@/config';
import { SsoRepository, SsoProviderRaw } from './sso.repository';
import { RefreshTokensRepository } from '@/modules/auth/refresh-tokens.repository';
import { UsersRepository } from '@/modules/users/users.repository';
import { InvitesRepository } from '@/modules/users/invites.repository';

interface OAuthState {
  providerId: string;
  redirectTo?: string;
  inviteToken?: string;
  /** PKCE (RFC 7636) code_verifier; optional only for states stored before PKCE rollout. */
  codeVerifier?: string;
}

interface TokenIssuanceUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

/**
 * The SSO login flow: authorization URL generation, OAuth callback
 * handling, user provisioning, and token issuance. Connection management
 * for existing accounts lives in SsoAccountService.
 */
@Injectable()
export class SsoService {
  private providerMap: Record<string, BaseOidcProvider>;

  constructor(
    private ssoRepo: SsoRepository,
    private refreshTokensRepo: RefreshTokensRepository,
    private usersRepo: UsersRepository,
    private invitesRepo: InvitesRepository,
    private redis: RedisService,
    private encryption: EncryptionService,
    private jwt: JwtService,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
    @Inject(authConfig.KEY)
    private auth: ConfigType<typeof authConfig>,
    @Inject(ssoConfig.KEY)
    private sso: ConfigType<typeof ssoConfig>,
    private googleProvider: GoogleProvider,
    private microsoftProvider: MicrosoftProvider,
  ) {
    this.providerMap = {
      GOOGLE: this.googleProvider,
      MICROSOFT: this.microsoftProvider,
    };
  }

  async generateAuthUrl(
    providerId: string,
    redirectTo?: string,
    inviteToken?: string,
  ): Promise<string> {
    const provider = await this.ssoRepo.findProviderRawById(providerId);

    if (!provider || !provider.isEnabled) {
      throw new ValidationError(
        ErrorCode.SSO_PROVIDER_DISABLED,
        'SSO provider is not available',
      );
    }

    const oidcProvider = this.getOidcProvider(provider.type);
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const stateData: OAuthState = {
      providerId,
      redirectTo,
      inviteToken,
      codeVerifier,
    };

    await this.redis.set(
      `oauth_state:${state}`,
      JSON.stringify(stateData),
      this.sso.stateTtl,
    );

    const callbackUrl = `${this.app.apiUrl}/api/auth/sso/callback`;

    return oidcProvider.getAuthorizationUrl({
      clientId: provider.clientId,
      redirectUri: callbackUrl,
      state,
      codeChallenge,
      allowedDomain: provider.allowedDomain,
    });
  }

  async handleCallback(
    code: string,
    state: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ redirectUrl: string }> {
    const webUrl = this.app.webUrl;

    const stateJson = await this.redis.get(`oauth_state:${state}`);
    if (!stateJson) {
      return {
        redirectUrl: `${webUrl}/login?sso_error=${ErrorCode.SSO_INVALID_STATE}`,
      };
    }
    await this.redis.del(`oauth_state:${state}`);

    const stateData: OAuthState = JSON.parse(stateJson);

    try {
      const provider = await this.ssoRepo.findProviderRawById(stateData.providerId);

      if (!provider || !provider.isEnabled) {
        return {
          redirectUrl: `${webUrl}/login?sso_error=${ErrorCode.SSO_PROVIDER_DISABLED}`,
        };
      }

      const oidcProvider = this.getOidcProvider(provider.type);
      const callbackUrl = `${this.app.apiUrl}/api/auth/sso/callback`;
      const clientSecret = this.encryption.decrypt(provider.clientSecret);

      const tokenResponse = await oidcProvider.exchangeCode({
        code,
        clientId: provider.clientId,
        clientSecret,
        redirectUri: callbackUrl,
        codeVerifier: stateData.codeVerifier,
      });

      const userInfo = await oidcProvider.getUserInfo(tokenResponse);

      const emailDomain = userInfo.email.split('@')[1]?.toLowerCase();
      if (emailDomain !== provider.allowedDomain.toLowerCase()) {
        return {
          redirectUrl: `${webUrl}/login?sso_error=${ErrorCode.SSO_DOMAIN_NOT_ALLOWED}`,
        };
      }

      const authResult = await this.findOrCreateUser(
        provider,
        userInfo,
        stateData.inviteToken,
        userAgent,
        ipAddress,
      );

      const finalizeCode = crypto.randomBytes(32).toString('hex');
      await this.redis.set(
        `sso_finalize:${finalizeCode}`,
        JSON.stringify({
          accessToken: authResult.accessToken,
          refreshToken: authResult.refreshToken,
          user: authResult.user,
        }),
        this.sso.finalizeCodeTtl,
      );

      const redirectTo = stateData.redirectTo || '/projects';
      return {
        redirectUrl: `${webUrl}/auth/sso/result?token=${finalizeCode}&redirectTo=${encodeURIComponent(redirectTo)}`,
      };
    } catch (error) {
      const errorCode =
        error instanceof DomainError
          ? error.code
          : ErrorCode.SSO_TOKEN_EXCHANGE_FAILED;

      return {
        redirectUrl: `${webUrl}/login?sso_error=${errorCode}`,
      };
    }
  }

  async finalize(code: string) {
    const dataJson = await this.redis.get(`sso_finalize:${code}`);

    if (dataJson) {
      await this.redis.del(`sso_finalize:${code}`);
    }

    if (!dataJson) {
      throw new ValidationError(
        ErrorCode.SSO_FINALIZE_FAILED,
        'Invalid or expired finalization code',
      );
    }

    return JSON.parse(dataJson);
  }

  // --- Private ---

  private async findOrCreateUser(
    provider: SsoProviderRaw,
    userInfo: OidcUserInfo,
    inviteToken: string | undefined,
    userAgent?: string,
    ipAddress?: string,
  ) {
    // Path A: Existing connection
    const existingConnection = await this.ssoRepo.findConnectionByExternal(
      provider.id,
      userInfo.sub,
    );

    if (existingConnection) {
      const user = existingConnection.user;

      if (user.isBlocked) {
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_BLOCKED,
          'Account has been blocked',
        );
      }

      if (user.deletedAt) {
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_DELETED,
          'Account has been deleted',
        );
      }

      await this.ssoRepo.touchConnectionLastUsed(existingConnection.id, userInfo.email);

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
        throw new PermissionDeniedError(
          ErrorCode.SSO_USER_BLOCKED,
          'Account has been blocked',
        );
      }

      if (existingUser.deletedAt) {
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
        await this.usersRepo.update(existingUser.id, { avatarUrl: userInfo.picture });
      }

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

    return this.issueTokens(newUser, userAgent, ipAddress);
  }

  private async handleInviteOnlyProvisioning(
    provider: SsoProviderRaw,
    userInfo: OidcUserInfo,
    inviteToken: string | undefined,
    userAgent?: string,
    ipAddress?: string,
  ) {
    let invite: {
      id: string;
      email: string;
      role: import('@prisma/client').GlobalRole;
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

    return this.issueTokens(newUser, userAgent, ipAddress);
  }

  private async issueTokens(
    user: TokenIssuanceUser,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.auth.refreshExpiresInDays);

    await this.refreshTokensRepo.create({
      userId: user.id,
      token: hashedToken,
      userAgent,
      ipAddress,
      expiresAt,
    });

    const refreshToken = this.jwt.sign(
      { sub: user.id, jti: rawRefreshToken },
      {
        secret: this.auth.refreshSecret,
        expiresIn: `${this.auth.refreshExpiresInDays}d`,
      },
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

  private getOidcProvider(type: SsoProviderType): BaseOidcProvider {
    const provider = this.providerMap[type];
    if (!provider) {
      throw new ValidationError(
        ErrorCode.SSO_PROVIDER_NOT_FOUND,
        `OIDC provider "${type}" is not supported`,
      );
    }
    return provider;
  }
}
