import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  Role,
} from '@repo/shared/schemas';
import { RolesRepository } from './roles.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

@Injectable()
export class RolesService {
  constructor(
    private rolesRepo: RolesRepository,
    private permissionsCache: PermissionsCacheService,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.rolesRepo.findAll();
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.rolesRepo.findOne(id);
    if (!role) {
      throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND);
    }
    return role;
  }

  async create(dto: CreateRoleInput): Promise<Role> {
    if (await this.rolesRepo.existsByName(dto.name)) {
      throw new ConflictError(ErrorCode.ROLE_NAME_TAKEN);
    }

    return this.rolesRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      permissions: dto.permissions,
    });
  }

  async update(id: string, dto: UpdateRoleInput): Promise<Role> {
    const role = await this.rolesRepo.findOne(id);
    if (!role) {
      throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND);
    }

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new ValidationError(ErrorCode.ROLE_SYSTEM_IMMUTABLE);
    }

    if (
      dto.name &&
      dto.name !== role.name &&
      (await this.rolesRepo.existsByName(dto.name))
    ) {
      throw new ConflictError(ErrorCode.ROLE_NAME_TAKEN);
    }

    const updated = await this.rolesRepo.update(id, {
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
    });
    await this.permissionsCache.invalidateAll();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const role = await this.rolesRepo.findSystemFlag(id);
    if (!role) {
      throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND);
    }

    if (role.isSystem) {
      throw new ValidationError(ErrorCode.ROLE_SYSTEM_IMMUTABLE);
    }

    const memberCount = await this.rolesRepo.countAssignedMembers(id);
    if (memberCount > 0) {
      throw new ValidationError(
        ErrorCode.ROLE_IN_USE,
        `Cannot delete role — it is assigned to ${memberCount} member(s)`,
      );
    }

    await this.rolesRepo.delete(id);
  }
}
