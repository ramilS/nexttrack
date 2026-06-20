import { Injectable } from '@nestjs/common';
import { CustomFieldType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';
import type { Version, VersionStatus } from '@repo/shared/schemas';

export interface VersionCreateInput {
  projectId: string;
  name: string;
  description: string | null;
  status: VersionStatus;
  releaseDate: string | null;
  ordinal: number;
}

export interface VersionPatch {
  name?: string;
  description?: string | null;
  status?: VersionStatus;
  releaseDate?: string | null;
}

type VersionRow = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: VersionStatus;
  releaseDate: Date | null;
  ordinal: number;
};

function toVersion(row: VersionRow): Version {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    status: row.status,
    releaseDate: row.releaseDate?.toISOString() ?? null,
    ordinal: row.ordinal,
  };
}

@Injectable()
export class VersionsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findAllByProject(projectId: string, status?: VersionStatus): Promise<Version[]> {
    const rows = await this.prisma.projectVersion.findMany({
      where: { projectId, ...(status ? { status } : {}) },
      orderBy: { ordinal: 'asc' },
    });
    return rows.map(toVersion);
  }

  /** Versions whose name matches `partial` (case-insensitive contains), capped at `limit`. */
  async findByNameContains(
    projectId: string,
    partial: string,
    limit: number,
  ): Promise<Version[]> {
    const rows = await this.prisma.projectVersion.findMany({
      where: { projectId, name: { contains: partial, mode: 'insensitive' } },
      take: limit,
    });
    return rows.map(toVersion);
  }

  async findById(versionId: string, projectId: string): Promise<Version | null> {
    const row = await this.prisma.projectVersion.findFirst({
      where: { id: versionId, projectId },
    });
    return row ? toVersion(row) : null;
  }

  async maxOrdinal(projectId: string): Promise<number> {
    const result = await this.prisma.projectVersion.aggregate({
      where: { projectId },
      _max: { ordinal: true },
    });
    return result._max.ordinal ?? -1;
  }

  async create(input: VersionCreateInput, tx?: Tx): Promise<Version> {
    const row = await this.db(tx).projectVersion.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        status: input.status,
        releaseDate: input.releaseDate ? new Date(input.releaseDate) : undefined,
        ordinal: input.ordinal,
      },
    });
    return toVersion(row);
  }

  async update(versionId: string, patch: VersionPatch, tx?: Tx): Promise<Version> {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.releaseDate !== undefined) {
      data.releaseDate = patch.releaseDate ? new Date(patch.releaseDate) : null;
    }

    const row = await this.db(tx).projectVersion.update({
      where: { id: versionId },
      data,
    });
    return toVersion(row);
  }

  async delete(versionId: string, tx?: Tx): Promise<void> {
    await this.db(tx).projectVersion.delete({ where: { id: versionId } });
  }

  /** Returns full domain Versions matching the given ids (no project scope). */
  async findManyByIds(ids: string[]): Promise<Version[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.projectVersion.findMany({
      where: { id: { in: ids } },
    });
    return rows.map(toVersion);
  }

  async findIdsByProject(projectId: string, ids: string[]): Promise<string[]> {
    const rows = await this.prisma.projectVersion.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async updateOrdinalsAtomic(
    pairs: { id: string; ordinal: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      pairs.map(({ id, ordinal }) =>
        this.prisma.projectVersion.update({ where: { id }, data: { ordinal } }),
      ),
    );
  }

  /**
   * Counts issues whose VERSION/MULTI_VERSION custom field values reference
   * the given `versionId` within the project. Reads CustomFieldValue but the
   * question — "is this version still in use anywhere?" — is owned by versions.
   */
  async countCustomFieldReferences(projectId: string, versionId: string): Promise<number> {
    // Count in the DB via JSON filters instead of loading every version-field
    // value and filtering in memory. VERSION stores a scalar id; MULTI_VERSION
    // stores an array of ids — hence the OR.
    return this.prisma.customFieldValue.count({
      where: {
        customField: {
          projectId,
          type: { in: [CustomFieldType.VERSION, CustomFieldType.MULTI_VERSION] },
          deletedAt: null,
        },
        OR: [
          { value: { equals: versionId } },
          { value: { array_contains: versionId } },
        ],
      },
    });
  }
}
