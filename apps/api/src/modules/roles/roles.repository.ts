import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Permission, Role } from '@repo/shared/schemas';

export interface RoleRef {
  id: string;
  name: string;
  permissions: string[];
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: unknown;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toPermissions(value: unknown): Permission[] {
  return Array.isArray(value) ? (value as Permission[]) : [];
}

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: toPermissions(row.permissions),
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoleRef(row: { id: string; name: string; permissions: unknown }): RoleRef {
  return {
    id: row.id,
    name: row.name,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
  };
}

export interface RoleCreateInput {
  name: string;
  description: string | null;
  permissions: Permission[];
}

export interface RolePatch {
  name?: string;
  description?: string | null;
  permissions?: Permission[];
}

export interface RoleSystemFlag {
  id: string;
  name: string;
  isSystem: boolean;
}

@Injectable()
export class RolesRepository {
  constructor(private prisma: PrismaService) {}

  async findById(roleId: string): Promise<RoleRef | null> {
    const row = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, permissions: true },
    });
    return row ? toRoleRef(row) : null;
  }

  async findAll(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toRole);
  }

  async findOne(id: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({ where: { id } });
    return row ? toRole(row) : null;
  }

  async findSystemFlag(id: string): Promise<RoleSystemFlag | null> {
    const row = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true, isSystem: true },
    });
    return row;
  }

  async existsByName(name: string): Promise<boolean> {
    const row = await this.prisma.role.findUnique({
      where: { name },
      select: { id: true },
    });
    return row !== null;
  }

  async create(input: RoleCreateInput): Promise<Role> {
    const row = await this.prisma.role.create({
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        isSystem: false,
      },
    });
    return toRole(row);
  }

  async update(id: string, patch: RolePatch): Promise<Role> {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.permissions !== undefined) data.permissions = patch.permissions;

    const row = await this.prisma.role.update({ where: { id }, data });
    return toRole(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }

  async countAssignedMembers(roleId: string): Promise<number> {
    return this.prisma.projectMember.count({ where: { roleId } });
  }
}
