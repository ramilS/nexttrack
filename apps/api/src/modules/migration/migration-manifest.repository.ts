import { Injectable } from '@nestjs/common';
import {
  MigrationEntityStatus,
  MigrationRunStatus,
  Prisma,
  type MigrationEntity,
  type MigrationRun,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';

export const MIGRATION_MANIFEST_PAGE_LIMIT_MAX = 500;

export interface StartMigrationRunInput {
  sourceSystem: string;
  sourceTenant: string;
  sourceUrl: string;
  targetUrl: string;
  config: Record<string, unknown>;
  configHash: string;
  specVersion: string;
  exclusionVersion: string;
}

export interface DiscoverEntityInput {
  entityType: string;
  sourceId: string;
  sourceChecksum: string;
}

export interface MigrationEntityPatch {
  sourceChecksum?: string;
  targetId?: string | null;
  status?: MigrationEntityStatus;
  attemptCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
  transformedAt?: Date | null;
  loadedAt?: Date | null;
  verifiedAt?: Date | null;
}

export interface ListMigrationEntitiesInput {
  entityType?: string;
  status?: MigrationEntityStatus;
  cursor?: string;
  limit: number;
}

export type MigrationStatusCounts = Partial<
  Record<MigrationEntityStatus, number>
>;

export interface MigrationRunSummary {
  run: MigrationRun;
  counts: MigrationStatusCounts;
}

@Injectable()
export class MigrationManifestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: StartMigrationRunInput): Promise<MigrationRun> {
    return this.prisma.migrationRun.create({
      data: { ...input, config: asJson(input.config) },
    });
  }

  async findRun(id: string): Promise<MigrationRun | null> {
    return this.prisma.migrationRun.findUnique({ where: { id } });
  }

  async findEntity(
    runId: string,
    entityType: string,
    sourceId: string,
  ): Promise<MigrationEntity | null> {
    return this.prisma.migrationEntity.findUnique({
      where: { runId_entityType_sourceId: { runId, entityType, sourceId } },
    });
  }

  async discoverMany(
    runId: string,
    inputs: DiscoverEntityInput[],
  ): Promise<MigrationEntity[]> {
    if (inputs.length === 0) return [];

    await this.prisma.migrationEntity.createMany({
      data: inputs.map((input) => ({ runId, ...input })),
      skipDuplicates: true,
    });

    return this.prisma.migrationEntity.findMany({
      where: {
        runId,
        OR: inputs.map(({ entityType, sourceId }) => ({ entityType, sourceId })),
      },
      take: Math.min(inputs.length, MIGRATION_MANIFEST_PAGE_LIMIT_MAX),
    });
  }

  async updateEntity(
    id: string,
    patch: MigrationEntityPatch,
  ): Promise<MigrationEntity> {
    const { errorDetails, ...data } = patch;
    const errorDetailsData =
      errorDetails === undefined
        ? {}
        : {
            errorDetails:
              errorDetails === null ? Prisma.JsonNull : asJson(errorDetails),
          };
    return this.prisma.migrationEntity.update({
      where: { id },
      data: { ...data, ...errorDetailsData },
    });
  }

  async updateRunStatus(
    id: string,
    status: MigrationRunStatus,
    completedAt: Date | null,
  ): Promise<MigrationRun> {
    return this.prisma.migrationRun.update({
      where: { id },
      data: { status, completedAt },
    });
  }

  async countNonterminal(runId: string): Promise<number> {
    return this.prisma.migrationEntity.count({
      where: {
        runId,
        status: {
          notIn: [
            MigrationEntityStatus.VERIFIED,
            MigrationEntityStatus.EXCLUDED_APPROVED,
          ],
        },
      },
    });
  }

  async summarize(run: MigrationRun): Promise<MigrationRunSummary> {
    const groups = await this.prisma.migrationEntity.groupBy({
      by: ['status'],
      where: { runId: run.id },
      _count: { _all: true },
    });
    const counts: MigrationStatusCounts = {};
    for (const group of groups) counts[group.status] = group._count._all;
    return { run, counts };
  }

  async listEntities(
    runId: string,
    input: ListMigrationEntitiesInput,
  ): Promise<MigrationEntity[]> {
    const limit = Math.min(
      Math.max(input.limit, 1),
      MIGRATION_MANIFEST_PAGE_LIMIT_MAX,
    );
    return this.prisma.migrationEntity.findMany({
      where: {
        runId,
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { id: 'asc' },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit,
    });
  }
}

/** Public repository surface used by the service and its typed unit-test mock. */
export type MigrationManifestStore = Pick<
  MigrationManifestRepository,
  keyof MigrationManifestRepository
>;
