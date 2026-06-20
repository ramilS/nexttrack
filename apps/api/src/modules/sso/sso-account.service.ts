import { Inject, Injectable } from '@nestjs/common';
import {
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { EncryptionService } from '@/common/services/encryption.service';
import { ErrorCode } from '@repo/shared/error-codes';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { BaseOidcProvider } from './providers/base-oidc.provider';
import { SsoProviderType } from '@prisma/client';
import type { UserSsoConnection } from '@repo/shared/schemas';
import { appConfig } from '@/config';
import { SsoRepository } from './sso.repository';
import { UsersReader } from '@/modules/users/users.reader';

/**
 * Manages SSO connections of an existing, authenticated account
 * (connect, disconnect, list). Extracted from SsoService, which keeps
 * the login flow only (authorize, callback, finalize).
 */
@Injectable()
export class SsoAccountService {
  private providerMap: Record<string, BaseOidcProvider>;

  constructor(
    private ssoRepo: SsoRepository,
    private usersRepo: UsersReader,
    private encryption: EncryptionService,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
    private googleProvider: GoogleProvider,
    private microsoftProvider: MicrosoftProvider,
  ) {
    this.providerMap = {
      GOOGLE: this.googleProvider,
      MICROSOFT: this.microsoftProvider,
    };
  }

  async connectToExistingAccount(
    userId: string,
    providerId: string,
    code: string,
  ) {
    const provider = await this.ssoRepo.findProviderRawById(providerId);

    if (!provider || !provider.isEnabled) {
      throw new ValidationError(
        ErrorCode.SSO_PROVIDER_DISABLED,
        'SSO provider is not available',
      );
    }

    const existingConnection = await this.ssoRepo.findConnectionByUserAndProvider(
      userId,
      providerId,
    );

    if (existingConnection) {
      throw new ValidationError(
        ErrorCode.SSO_ALREADY_CONNECTED,
        'Account is already connected to this provider',
      );
    }

    const oidcProvider = this.getOidcProvider(provider.type);
    const callbackUrl = `${this.app.apiUrl}/api/auth/sso/callback`;
    const clientSecret = this.encryption.decrypt(provider.clientSecret);

    const tokenResponse = await oidcProvider.exchangeCode({
      code,
      clientId: provider.clientId,
      clientSecret,
      redirectUri: callbackUrl,
    });

    const userInfo = await oidcProvider.getUserInfo(tokenResponse);

    const emailDomain = userInfo.email.split('@')[1]?.toLowerCase();
    if (emailDomain !== provider.allowedDomain.toLowerCase()) {
      throw new ValidationError(
        ErrorCode.SSO_DOMAIN_NOT_ALLOWED,
        'Email domain does not match provider configuration',
      );
    }

    await this.ssoRepo.createConnection({
      userId,
      providerId,
      externalId: userInfo.sub,
      email: userInfo.email,
    });

    return { connected: true };
  }

  async disconnect(userId: string, providerId: string) {
    const hasPassword = await this.usersRepo.findHasPasswordById(userId);

    if (hasPassword === null) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    if (!hasPassword) {
      const otherConnections = await this.ssoRepo.countConnectionsExcept(
        userId,
        providerId,
      );

      if (otherConnections === 0) {
        throw new ValidationError(
          ErrorCode.SSO_DISCONNECT_NO_PASSWORD,
          'Cannot disconnect SSO without a password. Set a password first.',
        );
      }
    }

    await this.ssoRepo.deleteConnections(userId, providerId);
  }

  async getUserConnections(userId: string): Promise<UserSsoConnection[]> {
    return this.ssoRepo.findUserConnections(userId);
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
