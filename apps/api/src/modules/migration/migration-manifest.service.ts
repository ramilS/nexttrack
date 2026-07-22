import { Inject, Injectable } from '@nestjs/common';
import {
  MigrationEntityStatus,
  type MigrationEntity,
  type MigrationRun,
} from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import {
  MIGRATION_MANIFEST_PAGE_LIMIT_MAX,
  ACTIVE_MIGRATION_SUCCESSOR,
  MigrationManifestRepository,
  type DiscoverEntityInput,
  type ListMigrationEntitiesInput,
  type MigrationEntityPatch,
  type MigrationRunSummary,
  type MigrationManifestStore,
  type StartMigrationRunInput,
} from './migration-manifest.repository';
import {
  buildMigrationRunFingerprint,
  normalizeMigrationUrl,
} from './migration-run-fingerprint';
import {
  canonicalJsonChecksum,
  containsMigrationSecret,
  sanitizeMigrationErrorDetails,
  sanitizeMigrationErrorMessage,
} from './migration-json';
import { safeMigrationRunConfigSchema } from './dto/migration-manifest.dto';

const ALLOWED: Readonly<
  Record<MigrationEntityStatus, readonly MigrationEntityStatus[]>
> = {
  [MigrationEntityStatus.DISCOVERED]: [
    MigrationEntityStatus.TRANSFORMED,
    MigrationEntityStatus.FAILED,
    MigrationEntityStatus.EXCLUDED_APPROVED,
  ],
  [MigrationEntityStatus.TRANSFORMED]: [
    MigrationEntityStatus.LOADED,
    MigrationEntityStatus.FAILED,
  ],
  [MigrationEntityStatus.LOADED]: [
    MigrationEntityStatus.VERIFIED,
    MigrationEntityStatus.FAILED,
  ],
  [MigrationEntityStatus.VERIFIED]: [MigrationEntityStatus.DISCOVERED],
  [MigrationEntityStatus.FAILED]: [
    MigrationEntityStatus.TRANSFORMED,
    MigrationEntityStatus.EXCLUDED_APPROVED,
  ],
  [MigrationEntityStatus.EXCLUDED_APPROVED]: [
    MigrationEntityStatus.DISCOVERED,
  ],
};

export interface TransitionMigrationEntityInput extends DiscoverEntityInput {
  status: MigrationEntityStatus;
  targetId?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

const SECRET_KEY = /(secret|token|password|credential|authorization|api[-_]?key)/i;

function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return containsMigrationSecret(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, nested]) => SECRET_KEY.test(key) || containsSecret(nested),
  );
}

@Injectable()
export class MigrationManifestService {
  constructor(
    @Inject(MigrationManifestRepository)
    private readonly repository: MigrationManifestStore,
  ) {}

  async startRun(input: StartMigrationRunInput): Promise<MigrationRun> {
    const parsedConfig = safeMigrationRunConfigSchema.safeParse(input.config);
    if (!parsedConfig.success || containsSecret(parsedConfig.data)) {
      throw new ValidationError(
        ErrorCode.MIGRATION_RESUME_CONFIG_MISMATCH,
        'Migration configuration must not contain secrets',
      );
    }
    const config = parsedConfig.data;
    const configHash = canonicalJsonChecksum(config);
    if (configHash !== input.configHash) {
      throw new ValidationError(
        ErrorCode.MIGRATION_CONFIG_HASH_MISMATCH,
        'Migration configuration hash does not match the configuration',
      );
    }
    this.assertSafeRunUrl(input.sourceUrl);
    this.assertSafeRunUrl(input.targetUrl);
    const sourceUrl = normalizeMigrationUrl(input.sourceUrl);
    const targetUrl = normalizeMigrationUrl(input.targetUrl);
    if (config.sourceUrl !== sourceUrl || config.targetUrl !== targetUrl) {
      throw new ValidationError(
        ErrorCode.MIGRATION_RESUME_CONFIG_MISMATCH,
        'Migration configuration URLs do not match the run URLs',
      );
    }
    const sourceTenant = new URL(sourceUrl).hostname.toLowerCase();
    if (input.sourceTenant.trim().toLowerCase() !== sourceTenant) {
      throw new ValidationError(
        ErrorCode.MIGRATION_SOURCE_TENANT_MISMATCH,
        'Migration source tenant does not match the source URL',
      );
    }
    const validated = {
      ...input,
      config,
      configHash,
      sourceTenant,
      sourceUrl,
      targetUrl,
    };
    const fingerprint = buildMigrationRunFingerprint(validated);
    return this.repository.createOrReturnActiveRun({
      ...validated,
      sourceTenant: fingerprint.sourceTenant,
      sourceUrl: fingerprint.sourceUrl,
      targetUrl: fingerprint.targetUrl,
      fingerprintHash: fingerprint.fingerprintHash,
    });
  }

  async getRun(runId: string): Promise<MigrationRunSummary> {
    const run = await this.requireRun(runId);
    return this.repository.summarize(run);
  }

  async discover(
    runId: string,
    inputs: DiscoverEntityInput[],
  ): Promise<MigrationEntity[]> {
    if (inputs.length > MIGRATION_MANIFEST_PAGE_LIMIT_MAX) {
      throw new ValidationError(
        ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
        `Discovery batches may contain at most ${MIGRATION_MANIFEST_PAGE_LIMIT_MAX} entities`,
      );
    }
    const entities = await this.repository.discoverMany(runId, inputs);
    if (entities === ACTIVE_MIGRATION_SUCCESSOR) {
      throw new ConflictError(
        ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
        'Completed migration run has an active successor',
      );
    }
    if (!entities) throw new NotFoundError(ErrorCode.MIGRATION_RUN_NOT_FOUND);
    return entities;
  }

  async transition(
    runId: string,
    input: TransitionMigrationEntityInput,
  ): Promise<MigrationEntity> {
    const entity = await this.repository.findEntity(
      runId,
      input.entityType,
      input.sourceId,
    );
    if (!entity) {
      throw new NotFoundError(ErrorCode.MIGRATION_ENTITY_NOT_FOUND);
    }
    if (entity.sourceChecksum !== input.sourceChecksum) {
      throw new ConflictError(ErrorCode.MIGRATION_CHECKSUM_MISMATCH);
    }
    if (!ALLOWED[entity.status].includes(input.status)) {
      throw this.invalidTransition(entity.status, input.status);
    }
    if (
      (input.status === MigrationEntityStatus.LOADED ||
        input.status === MigrationEntityStatus.VERIFIED) &&
      !input.targetId
    ) {
      throw this.invalidTransition(entity.status, input.status);
    }
    if (
      input.status === MigrationEntityStatus.FAILED &&
      (!input.error?.code || !input.error.message)
    ) {
      throw this.invalidTransition(entity.status, input.status);
    }

    const now = new Date();
    const patch: MigrationEntityPatch = { status: input.status };
    if (input.targetId !== undefined) patch.targetId = input.targetId;
    if (input.status === MigrationEntityStatus.TRANSFORMED) {
      patch.attemptCount = entity.attemptCount + 1;
      patch.transformedAt = now;
    }
    if (input.status === MigrationEntityStatus.LOADED) patch.loadedAt = now;
    if (input.status === MigrationEntityStatus.VERIFIED) patch.verifiedAt = now;
    if (input.status === MigrationEntityStatus.FAILED && input.error) {
      patch.errorCode = input.error.code;
      patch.errorMessage = sanitizeMigrationErrorMessage(input.error.message);
      patch.errorDetails = input.error.details
        ? sanitizeMigrationErrorDetails(input.error.details)
        : null;
    }
    const updated = await this.repository.updateEntity({
      id: entity.id,
      runId,
      expectedStatus: entity.status,
      expectedChecksum: entity.sourceChecksum,
      patch,
    });
    if (!updated) {
      throw new ConflictError(
        ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
        'Migration entity state changed before the transition was persisted',
      );
    }
    return updated;
  }

  async listEntities(
    runId: string,
    input: ListMigrationEntitiesInput,
  ): Promise<MigrationEntity[]> {
    await this.requireRun(runId);
    return this.repository.listEntities(runId, input);
  }

  async complete(runId: string): Promise<MigrationRunSummary> {
    const result = await this.repository.completeRun(runId);
    if (result.outcome === 'not_found') {
      throw new NotFoundError(ErrorCode.MIGRATION_RUN_NOT_FOUND);
    }
    if (result.outcome === 'incomplete') {
      throw new ValidationError(
        ErrorCode.MIGRATION_RUN_INCOMPLETE,
        'Migration run contains nonterminal entities',
      );
    }
    return result.summary;
  }

  private async requireRun(runId: string): Promise<MigrationRun> {
    const run = await this.repository.findRun(runId);
    if (!run) throw new NotFoundError(ErrorCode.MIGRATION_RUN_NOT_FOUND);
    return run;
  }

  private invalidTransition(
    from: MigrationEntityStatus,
    to: MigrationEntityStatus,
  ): ConflictError {
    return new ConflictError(
      ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
      `Cannot transition migration entity from ${from} to ${to}`,
    );
  }

  private assertSafeRunUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ValidationError(
        ErrorCode.MIGRATION_RUN_URL_INVALID,
        'Migration run URLs must be valid HTTP(S) origins',
      );
    }
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username || url.password || url.search || url.hash
    ) {
      throw new ValidationError(
        ErrorCode.MIGRATION_RUN_URL_INVALID,
        'Migration run URLs must be HTTP(S) origins without credentials, query strings, or fragments',
      );
    }
  }
}
