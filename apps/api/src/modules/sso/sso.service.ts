import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { DomainError, ValidationError } from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { ValkeyService } from '@/valkey/valkey.service';
import { EncryptionService } from '@/common/services/encryption.service';
import { ErrorCode } from '@repo/shared/error-codes';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { BaseOidcProvider } from './providers/base-oidc.provider';
import { SsoProviderType } from '@prisma/client';
import { appConfig, ssoConfig } from '@/config';
import { SsoRepository } from './sso.repository';
import { SsoProvisioningService } from './sso-provisioning.service';

interface OAuthState {
  providerId: string;
  redirectTo?: string;
  inviteToken?: string;
  /** PKCE (RFC 7636) code_verifier; optional only for states stored before PKCE rollout. */
  codeVerifier?: string;
}

/**
 * The SSO login flow: authorization URL generation, OAuth callback
 * handling, user provisioning, and token issuance. Connection management
 * for existing accounts lives in SsoAccountService.
 */
@Injectable()
export class SsoService {
  private readonly logger = new AppLogger(SsoService.name);
  private providerMap: Record<string, BaseOidcProvider>;

  constructor(
    private ssoRepo: SsoRepository,
    private provisioning: SsoProvisioningService,
    private valkey: ValkeyService,
    private encryption: EncryptionService,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
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

    await this.valkey.set(
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

    const stateJson = await this.valkey.get(`oauth_state:${state}`);
    if (!stateJson) {
      return {
        redirectUrl: `${webUrl}/login?sso_error=${ErrorCode.SSO_INVALID_STATE}`,
      };
    }
    await this.valkey.del(`oauth_state:${state}`);

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

      const authResult = await this.provisioning.findOrCreateUser(
        provider,
        userInfo,
        stateData.inviteToken,
        userAgent,
        ipAddress,
      );

      const finalizeCode = crypto.randomBytes(32).toString('hex');
      await this.valkey.set(
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

      this.logger.warn('SSO callback failed', {
        providerId: stateData.providerId,
        errorCode,
        ip: ipAddress,
      });

      return {
        redirectUrl: `${webUrl}/login?sso_error=${errorCode}`,
      };
    }
  }

  async finalize(code: string) {
    const dataJson = await this.valkey.get(`sso_finalize:${code}`);

    if (dataJson) {
      await this.valkey.del(`sso_finalize:${code}`);
    }

    if (!dataJson) {
      throw new ValidationError(
        ErrorCode.SSO_FINALIZE_FAILED,
        'Invalid or expired finalization code',
      );
    }

    return JSON.parse(dataJson);
  }

  /**
   * Open-redirect guard for the post-login `redirectTo`: only same-origin
   * absolute URLs or relative paths are allowed; anything else is dropped.
   */
  safeRedirectTarget(redirectTo?: string): string | undefined {
    if (!redirectTo) return undefined;
    if (redirectTo.startsWith('/')) return redirectTo;
    try {
      const target = new URL(redirectTo);
      const allowed = new URL(this.app.webUrl);
      if (target.origin === allowed.origin) return redirectTo;
    } catch {
      // Malformed redirectTo URL — reject by falling through to undefined.
    }
    return undefined;
  }

  // --- Private ---

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
