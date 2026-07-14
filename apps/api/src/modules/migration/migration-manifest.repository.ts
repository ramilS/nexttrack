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
export const ACTIVE_MIGRATION_SUCCESSOR = Symbol('ACTIVE_MIGRATION_SUCCESSOR');

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

interface CreateMigrationRunInput extends StartMigrationRunInput {
  fingerprintHash: string;
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

export type CompleteMigrationRunResult =
  | { outcome: 'not_found' }
  | { outcome: 'incomplete' }
  | { outcome: 'completed'; summary: MigrationRunSummary };

export interface ConditionalEntityTransition {
  id: string;
  runId: string;
  expectedStatus: MigrationEntityStatus;
  expectedChecksum: string;
  patch: MigrationEntityPatch;
}

@Injectable()
export class MigrationManifestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrReturnActiveRun(
    input: CreateMigrationRunInput,
  ): Promise<MigrationRun> {
    const lockKey = this.advisoryLockKey(input.fingerprintHash);
    return this.prisma.$transaction(async (tx) => {
      await this.lockFingerprint(tx, lockKey);

      const active = await tx.migrationRun.findFirst({
        where: {
          fingerprintHash: input.fingerprintHash,
          status: { not: MigrationRunStatus.COMPLETED },
        },
      });
      if (active) return active;

      return tx.migrationRun.create({
        data: { ...input, config: asJson(input.config) },
      });
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
  ): Promise<MigrationEntity[] | null | typeof ACTIVE_MIGRATION_SUCCESSOR> {
    if (inputs.length === 0) return [];

    return this.prisma.$transaction(async (tx) => {
      const run = await this.lockRun(tx, runId);
      if (!run) return null;
      if (await this.hasActiveSuccessor(tx, run)) {
        return ACTIVE_MIGRATION_SUCCESSOR;
      }
      await tx.migrationEntity.createMany({
        data: inputs.map((input) => ({ runId, ...input })),
        skipDuplicates: true,
      });

      const where = {
        runId,
        OR: inputs.map(({ entityType, sourceId }) => ({ entityType, sourceId })),
      };
      let entities = await tx.migrationEntity.findMany({
        where,
        take: Math.min(inputs.length, MIGRATION_MANIFEST_PAGE_LIMIT_MAX),
      });
      const inputByKey = new Map(
        inputs.map((input) => [
          `${input.entityType}\u0000${input.sourceId}`,
          input,
        ]),
      );
      const changed = entities.flatMap((entity) => {
        const input = inputByKey.get(
          `${entity.entityType}\u0000${entity.sourceId}`,
        );
        return input && input.sourceChecksum !== entity.sourceChecksum
          ? [{ id: entity.id, sourceChecksum: input.sourceChecksum }]
          : [];
      });

      if (changed.length > 0) {
        const values = Prisma.join(
          changed.map(({ id, sourceChecksum }) =>
            Prisma.sql`(${id}, ${sourceChecksum})`,
          ),
        );
        await tx.$executeRaw(Prisma.sql`
          UPDATE migration_entities AS entity
          SET source_checksum = changed.source_checksum,
              status = ${MigrationEntityStatus.DISCOVERED}::migration_entity_status,
              target_id = NULL,
              error_code = NULL,
              error_message = NULL,
              error_details = NULL,
              transformed_at = NULL,
              loaded_at = NULL,
              verified_at = NULL,
              updated_at = NOW()
          FROM (VALUES ${values}) AS changed(id, source_checksum)
          WHERE entity.id = changed.id
            AND entity.run_id = ${runId}
        `);
        entities = await tx.migrationEntity.findMany({
          where,
          take: Math.min(inputs.length, MIGRATION_MANIFEST_PAGE_LIMIT_MAX),
        });
      }

      if (entities.some((entity) => !this.isTerminal(entity.status))) {
        await tx.migrationRun.updateMany({
          where: { id: runId, status: MigrationRunStatus.COMPLETED },
          data: { status: MigrationRunStatus.RUNNING, completedAt: null },
        });
      }
      return entities;
    });
  }

  async updateEntity(
    input: ConditionalEntityTransition,
  ): Promise<MigrationEntity | null> {
    return this.prisma.$transaction(async (tx) => {
      const run = await this.lockRun(tx, input.runId);
      if (!run || (await this.hasActiveSuccessor(tx, run))) return null;

      const { errorDetails, ...data } = input.patch;
      const errorDetailsData =
        errorDetails === undefined
          ? {}
          : {
              errorDetails:
                errorDetails === null ? Prisma.JsonNull : asJson(errorDetails),
            };
      const result = await tx.migrationEntity.updateMany({
        where: {
          id: input.id,
          runId: input.runId,
          status: input.expectedStatus,
          sourceChecksum: input.expectedChecksum,
        },
        data: { ...data, ...errorDetailsData },
      });
      if (result.count === 0) return null;

      if (input.patch.status && !this.isTerminal(input.patch.status)) {
        await tx.migrationRun.updateMany({
          where: { id: input.runId, status: MigrationRunStatus.COMPLETED },
          data: { status: MigrationRunStatus.RUNNING, completedAt: null },
        });
      }
      return tx.migrationEntity.findUniqueOrThrow({ where: { id: input.id } });
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

  async completeRun(runId: string): Promise<CompleteMigrationRunResult> {
    return this.prisma.$transaction(async (tx) => {
      const run = await this.lockRun(tx, runId);
      if (!run) return { outcome: 'not_found' };

      const nonterminal = await tx.migrationEntity.count({
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
      if (nonterminal > 0) return { outcome: 'incomplete' };

      const completed = await tx.migrationRun.update({
        where: { id: runId },
        data: { status: MigrationRunStatus.COMPLETED, completedAt: new Date() },
      });
      const groups = await tx.migrationEntity.groupBy({
        by: ['status'],
        where: { runId },
        _count: { _all: true },
      });
      const counts: MigrationStatusCounts = {};
      for (const group of groups) counts[group.status] = group._count._all;
      return { outcome: 'completed', summary: { run: completed, counts } };
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

  private async lockRun(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<MigrationRun | null> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM migration_runs
      WHERE id = ${runId}
      FOR UPDATE
    `;
    if (locked.length === 0) return null;
    return tx.migrationRun.findUnique({ where: { id: runId } });
  }

  private async hasActiveSuccessor(
    tx: Prisma.TransactionClient,
    run: MigrationRun,
  ): Promise<boolean> {
    if (run.status !== MigrationRunStatus.COMPLETED) return false;
    await this.lockFingerprint(tx, this.advisoryLockKey(run.fingerprintHash));
    const successor = await tx.migrationRun.findFirst({
      where: {
        id: { not: run.id },
        fingerprintHash: run.fingerprintHash,
        status: { not: MigrationRunStatus.COMPLETED },
      },
      select: { id: true },
    });
    return successor !== null;
  }

  private async lockFingerprint(
    tx: Prisma.TransactionClient,
    lockKey: bigint,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(${lockKey})::text AS lock_result
    `;
  }

  private isTerminal(status: MigrationEntityStatus): boolean {
    return (
      status === MigrationEntityStatus.VERIFIED ||
      status === MigrationEntityStatus.EXCLUDED_APPROVED
    );
  }

  private advisoryLockKey(fingerprintHash: string): bigint {
    const unsigned = BigInt(`0x${fingerprintHash.slice(0, 16)}`);
    return unsigned >= 1n << 63n ? unsigned - (1n << 64n) : unsigned;
  }
}

/** Public repository surface used by the service and its typed unit-test mock. */
export type MigrationManifestStore = Pick<
  MigrationManifestRepository,
  keyof MigrationManifestRepository
>;
