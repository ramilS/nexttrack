import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { EncryptionService } from '@/common/services/encryption.service';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  CreateSsoProviderParsed,
  UpdateSsoProviderInput,
  SsoProvider,
  PublicSsoProvider,
} from '@repo/shared/schemas';
import { SsoRepository } from './sso.repository';

@Injectable()
export class SsoProvidersService {
  constructor(
    private ssoRepo: SsoRepository,
    private encryption: EncryptionService,
  ) {}

  async create(adminId: string, dto: CreateSsoProviderParsed): Promise<SsoProvider> {
    return this.ssoRepo.createProvider({
      name: dto.name,
      type: dto.type,
      clientId: dto.clientId,
      clientSecret: this.encryption.encrypt(dto.clientSecret),
      allowedDomain: dto.allowedDomain,
      provisioningPolicy: dto.provisioningPolicy,
      defaultRole: dto.defaultRole,
      attributeMapping: dto.attributeMapping ?? null,
      createdById: adminId,
    });
  }

  async findAll(): Promise<SsoProvider[]> {
    return this.ssoRepo.findAllProviders();
  }

  async findById(id: string): Promise<SsoProvider> {
    const provider = await this.ssoRepo.findProviderById(id);
    if (!provider) {
      throw new NotFoundError(ErrorCode.SSO_PROVIDER_NOT_FOUND);
    }
    return provider;
  }

  async findPublicEnabled(): Promise<PublicSsoProvider[]> {
    return this.ssoRepo.findPublicEnabled();
  }

  async update(id: string, dto: UpdateSsoProviderInput): Promise<SsoProvider> {
    const existing = await this.ssoRepo.findProviderRawById(id);
    if (!existing) {
      throw new NotFoundError(ErrorCode.SSO_PROVIDER_NOT_FOUND);
    }

    const patch = { ...dto };
    if (dto.clientSecret) {
      patch.clientSecret = this.encryption.encrypt(dto.clientSecret);
    }

    return this.ssoRepo.updateProvider(id, patch);
  }

  async enable(id: string): Promise<SsoProvider> {
    const provider = await this.ssoRepo.findProviderRawById(id);
    if (!provider) {
      throw new NotFoundError(ErrorCode.SSO_PROVIDER_NOT_FOUND);
    }

    if (!provider.clientId || !provider.clientSecret) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'Client ID and Client Secret are required to enable provider',
      );
    }

    if (!provider.allowedDomain) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'Allowed domain is required to enable provider',
      );
    }

    return this.ssoRepo.setProviderEnabled(id, true);
  }

  async disable(id: string): Promise<SsoProvider> {
    const provider = await this.ssoRepo.findProviderRawById(id);
    if (!provider) {
      throw new NotFoundError(ErrorCode.SSO_PROVIDER_NOT_FOUND);
    }
    return this.ssoRepo.setProviderEnabled(id, false);
  }

  async remove(id: string): Promise<void> {
    const provider = await this.ssoRepo.findProviderById(id);
    if (!provider) {
      throw new NotFoundError(ErrorCode.SSO_PROVIDER_NOT_FOUND);
    }

    if (provider.connectionsCount > 0) {
      throw new ConflictError(
        ErrorCode.SSO_HAS_CONNECTIONS,
        `Cannot delete provider with ${provider.connectionsCount} connected users`,
      );
    }

    await this.ssoRepo.deleteProvider(id);
  }

  async findConnections(providerId: string, page: number, perPage: number) {
    return this.ssoRepo.findProviderConnectionsPage(providerId, page, perPage);
  }
}
