import axios from 'axios';
import { MigrationEntity, OurApiClient, TransitionMigrationEntity } from '../loaders/api-client';
import { classifyMigrationError } from '../utils/error-classification';
import { formatHttpError } from '../utils/http-error';
import { CanonicalEntity } from './manifest.types';

export interface EntityHandlers<TPayload, TTransformed> {
  transform: (payload: TPayload) => Promise<TTransformed> | TTransformed;
  load: (value: TTransformed) => Promise<{ targetId: string }>;
  verify: (targetId: string, value: TTransformed) => Promise<void>;
}

export type ExecutionResult =
  | { status: 'VERIFIED'; targetId: string; skipped: boolean }
  | { status: 'FAILED'; error: string };

export class MigrationVerificationMismatchError extends Error {
  readonly code = 'MIGRATION_VERIFICATION_MISMATCH';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationVerificationMismatchError';
  }
}

export class ManifestDiscoveryIntegrityError extends Error {
  readonly code = 'MIGRATION_MANIFEST_INTEGRITY_ERROR';

  constructor(entityType: string, sourceId: string) {
    super(`Manifest discovery identity mismatch for ${entityType} ${sourceId}`);
    this.name = 'ManifestDiscoveryIntegrityError';
  }
}

export class ManifestEntityExecutor {
  constructor(
    private readonly runId: string,
    private readonly api: OurApiClient,
  ) {}

  async execute<TPayload, TTransformed>(
    entity: CanonicalEntity<TPayload>,
    handlers: EntityHandlers<TPayload, TTransformed>,
  ): Promise<ExecutionResult> {
    const discovered = await this.api.discoverEntities(this.runId, {
      entities: [
        {
          entityType: entity.entityType,
          sourceId: entity.sourceId,
          sourceChecksum: entity.checksum,
        },
      ],
    });
    const manifest = discovered.data[0];
    if (!manifest) {
      throw new Error(
        `Manifest discovery returned no ${entity.entityType} entity for ${entity.sourceId}`,
      );
    }
    this.assertDiscoveredIdentity(entity, manifest);

    if (manifest.status === 'VERIFIED') {
      return {
        status: 'VERIFIED',
        targetId: this.requireTargetId(manifest.targetId, entity),
        skipped: true,
      };
    }

    try {
      if (manifest.status === 'DISCOVERED' || manifest.status === 'FAILED') {
        await this.transition(entity, { status: 'TRANSFORMED' });
      } else if (manifest.status !== 'TRANSFORMED' && manifest.status !== 'LOADED') {
        throw new Error(
          `Cannot execute ${entity.entityType} ${entity.sourceId} from manifest state ${manifest.status}`,
        );
      }

      const transformed = await handlers.transform(entity.payload);
      let targetId: string;
      if (manifest.status === 'LOADED') {
        targetId = this.requireTargetId(manifest.targetId, entity);
      } else {
        const loaded = await handlers.load(transformed);
        targetId = this.requireTargetId(loaded.targetId, entity);
        await this.transition(entity, { status: 'LOADED', targetId });
      }

      await handlers.verify(targetId, transformed);
      await this.transition(entity, { status: 'VERIFIED', targetId });
      return { status: 'VERIFIED', targetId, skipped: false };
    } catch (error) {
      const classification = classifyMigrationError(error);
      const message = formatHttpError(error);
      const errorCode = this.errorCode(error);
      if (
        errorCode === 'MIGRATION_INVALID_STATE_TRANSITION' ||
        errorCode === 'MIGRATION_CHECKSUM_MISMATCH'
      ) {
        throw error;
      }
      const verificationMismatch =
        error instanceof MigrationVerificationMismatchError ||
        errorCode === 'MIGRATION_VERIFICATION_MISMATCH';
      const failed = {
        status: 'FAILED' as const,
        error: {
          code: verificationMismatch ? 'MIGRATION_VERIFICATION_MISMATCH' : errorCode,
          message,
        },
      };

      if (classification === 'PERMANENT') {
        await this.transition(entity, failed);
        return { status: 'FAILED', error: message };
      }

      // There is no run-failure endpoint. Report the current entity best-effort,
      // but preserve the original fatal/transient error so auth and exhausted
      // transport failures stop the caller's entity loop promptly.
      try {
        await this.transition(entity, failed);
      } catch {
        // Reporting commonly fails with the same auth/transport outage.
      }
      throw error;
    }
  }

  private transition<T>(
    entity: CanonicalEntity<T>,
    transition: Pick<TransitionMigrationEntity, 'status' | 'targetId' | 'error'>,
  ) {
    return this.api.transitionEntity(this.runId, {
      entityType: entity.entityType,
      sourceId: entity.sourceId,
      sourceChecksum: entity.checksum,
      ...transition,
    });
  }

  private assertDiscoveredIdentity<T>(entity: CanonicalEntity<T>, manifest: MigrationEntity): void {
    if (
      manifest.runId !== this.runId ||
      manifest.entityType !== entity.entityType ||
      manifest.sourceId !== entity.sourceId ||
      manifest.sourceChecksum !== entity.checksum
    ) {
      throw new ManifestDiscoveryIntegrityError(entity.entityType, entity.sourceId);
    }
  }

  private requireTargetId<T>(
    targetId: string | null | undefined,
    entity: CanonicalEntity<T>,
  ): string {
    if (!targetId?.trim()) {
      throw new Error(`Missing target ID for ${entity.entityType} ${entity.sourceId}`);
    }
    return targetId;
  }

  private errorCode(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data;
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const nested = body.error;
        if (
          typeof nested === 'object' &&
          nested !== null &&
          'code' in nested &&
          typeof nested.code === 'string'
        ) {
          return nested.code;
        }
      }
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code;
    }
    return 'MIGRATION_ENTITY_FAILED';
  }
}
