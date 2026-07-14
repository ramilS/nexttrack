import type { MigrateOptions } from '../commands/migrate.command';
import { OurApiClient } from '../loaders/api-client';
import {
  EXCLUSION_VERSION,
  MIGRATION_SPEC_VERSION,
  buildRunConfig,
} from './run-config';
import { sourceChecksum } from './stable-checksum';

const RESUME_CONFIG_MISMATCH = 'MIGRATION_RESUME_CONFIG_MISMATCH' as const;

interface ResumeCheckpoint {
  runId: string;
  configHash: string;
}

export class ResumeConfigMismatchError extends Error {
  readonly code = RESUME_CONFIG_MISMATCH;

  constructor(fields: string[]) {
    super(`Migration resume configuration mismatch: ${fields.join(', ')}`);
    this.name = 'ResumeConfigMismatchError';
  }
}

export class MigrationRunCoordinator {
  constructor(private readonly api: OurApiClient) {}

  async open(
    options: MigrateOptions,
    checkpoint: ResumeCheckpoint | null,
  ): Promise<{ runId: string; configHash: string }> {
    const config = buildRunConfig(options);
    const configHash = sourceChecksum(config);
    const sourceTenant = new URL(config.sourceUrl).hostname;

    if (!options.resume) {
      const result = await this.api.startMigrationRun({
        sourceSystem: 'youtrack-cloud',
        sourceTenant,
        sourceUrl: config.sourceUrl,
        targetUrl: config.targetUrl,
        config,
        configHash,
        specVersion: MIGRATION_SPEC_VERSION,
        exclusionVersion: EXCLUSION_VERSION,
      });
      return { runId: result.data.id, configHash };
    }

    if (!checkpoint) {
      throw new Error('A manifest-backed checkpoint is required to resume migration');
    }

    const existing = (await this.api.getMigrationRun(checkpoint.runId)).data;
    const expected = {
      sourceSystem: 'youtrack-cloud',
      sourceTenant,
      sourceUrl: config.sourceUrl,
      targetUrl: config.targetUrl,
      configHash,
      specVersion: MIGRATION_SPEC_VERSION,
      exclusionVersion: EXCLUSION_VERSION,
    } as const;
    const mismatches = (Object.keys(expected) as Array<keyof typeof expected>).filter(
      (field) => existing[field] !== expected[field],
    );
    if (checkpoint.configHash !== configHash && !mismatches.includes('configHash')) {
      mismatches.push('configHash');
    }
    if (mismatches.length > 0) {
      throw new ResumeConfigMismatchError(mismatches);
    }

    return { runId: checkpoint.runId, configHash };
  }
}
