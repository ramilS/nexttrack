import { Injectable } from '@nestjs/common';
import { CustomFieldType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type { CustomField } from '@repo/shared/schemas';

export interface CustomFieldConfig {
  options?: Array<{ id: string; name: string; color: string | null; ordinal: number }>;
  maxLength?: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  [key: string]: unknown;
}

export function getFieldConfig(field: { config: unknown }): CustomFieldConfig {
  return (field.config ?? {}) as CustomFieldConfig;
}

export interface CustomFieldCreateInput {
  projectId: string;
  name: string;
  type: CustomFieldType;
  description: string | null;
  isRequired: boolean;
  ordinal: number;
  config: Record<string, unknown>;
}

export interface CustomFieldPatch {
  name?: string;
  description?: string | null;
  isRequired?: boolean;
  config?: Record<string, unknown>;
}

type CustomFieldRow = {
  id: string;
  projectId: string;
  name: string;
  type: CustomFieldType;
  description: string | null;
  isRequired: boolean;
  ordinal: number;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
  _count?: { values: number };
};

function toCustomField(row: CustomFieldRow): CustomField {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    description: row.description,
    isRequired: row.isRequired,
    ordinal: row.ordinal,
    config: getFieldConfig(row),
    valuesCount: row._count?.values ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CustomFieldsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findManyByProject(projectId: string): Promise<CustomField[]> {
    const rows = await this.prisma.customField.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { ordinal: 'asc' },
      include: { _count: { select: { values: true } } },
    });
    return rows.map(toCustomField);
  }

  async findOneInProject(
    fieldId: string,
    projectId: string,
  ): Promise<CustomField | null> {
    const row = await this.prisma.customField.findFirst({
      where: { id: fieldId, projectId, deletedAt: null },
      include: { _count: { select: { values: true } } },
    });
    return row ? toCustomField(row) : null;
  }

  /**
   * Looks up a non-deleted field by case-insensitive name match within a
   * project. Used by autocomplete to resolve a typed field name to its
   * definition (e.g. type + config) for value suggestions.
   */
  async findByNameInsensitive(
    projectId: string,
    name: string,
  ): Promise<CustomField | null> {
    const row = await this.prisma.customField.findFirst({
      where: {
        projectId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
      include: { _count: { select: { values: true } } },
    });
    return row ? toCustomField(row) : null;
  }

  /** Minimal `{name, type}` rows for autocomplete field-name suggestions. */
  async findNameTypeRefsByProject(
    projectId: string,
  ): Promise<Array<{ name: string; type: CustomFieldType }>> {
    return this.prisma.customField.findMany({
      where: { projectId, deletedAt: null },
      select: { name: true, type: true },
    });
  }

  /**
   * Look up `customField` rows by ids, scoped to a project. Used by reorder
   * validation to confirm every supplied id belongs to the project.
   */
  async findIdsInProject(
    fieldIds: string[],
    projectId: string,
  ): Promise<string[]> {
    if (fieldIds.length === 0) return [];
    const rows = await this.prisma.customField.findMany({
      where: { id: { in: fieldIds }, projectId, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Required (non-deleted) fields for a project, minimal shape. */
  async findRequiredInProject(
    projectId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.customField.findMany({
      where: { projectId, isRequired: true, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  async maxOrdinal(projectId: string): Promise<number> {
    const result = await this.prisma.customField.aggregate({
      where: { projectId, deletedAt: null },
      _max: { ordinal: true },
    });
    return result._max.ordinal ?? -1;
  }

  async create(input: CustomFieldCreateInput): Promise<CustomField> {
    const row = await this.prisma.customField.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        description: input.description,
        isRequired: input.isRequired,
        ordinal: input.ordinal,
        config: asJson(input.config),
      },
      include: { _count: { select: { values: true } } },
    });
    return toCustomField(row);
  }

  async update(fieldId: string, patch: CustomFieldPatch): Promise<CustomField> {
    const data: Prisma.CustomFieldUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.isRequired !== undefined) data.isRequired = patch.isRequired;
    if (patch.config !== undefined) data.config = asJson(patch.config);

    const row = await this.prisma.customField.update({
      where: { id: fieldId },
      data,
      include: { _count: { select: { values: true } } },
    });
    return toCustomField(row);
  }

  /** Persists a normalized config without changing scalar fields. */
  async updateConfig(
    fieldId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.customField.update({
      where: { id: fieldId },
      data: { config: asJson(config) },
    });
  }

  async softDelete(fieldId: string, deletedBy: string): Promise<void> {
    await this.prisma.customField.update({
      where: { id: fieldId },
      data: { deletedAt: new Date(), deletedById: deletedBy },
    });
  }

  /** Atomically updates ordinals for a batch of fields. */
  async updateOrdinalsAtomic(
    pairs: Array<{ id: string; ordinal: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(
      pairs.map(({ id, ordinal }) =>
        this.prisma.customField.update({ where: { id }, data: { ordinal } }),
      ),
    );
  }
}
