import { existsSync } from 'fs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'fs/promises';
import {
  MigrationCheckpoint,
  PhaseProgress,
} from './checkpoint.types';
import { sanitizeMigrationErrorMessage } from '../utils/http-error';

export function checkpointProjectKey(project: string): string {
  if (sanitizeMigrationErrorMessage(project) === project) return project;
  const suffix = createHash('sha256').update(project).digest('hex').slice(0, 12);
  return `[redacted-${suffix}]`;
}

const KNOWN_PHASES = new Set([
  'users', 'projects', 'issues', 'parentLinks', 'links', 'tags', 'comments',
  'history', 'attachments', 'timeLogs', 'boards', 'timestamps', 'reindex',
  'dry-run',
]);

export function checkpointPhaseKey(phase: string): string {
  if (KNOWN_PHASES.has(phase)) return phase;
  const suffix = createHash('sha256').update(phase).digest('hex').slice(0, 12);
  return `[unknown-${suffix}]`;
}

export function normalizeCheckpointProgressKeys(
  checkpoint: MigrationCheckpoint,
): void {
  for (const error of checkpoint.errors) {
    error.phase = checkpointPhaseKey(error.phase);
    if (error.projectKey) error.projectKey = checkpointProjectKey(error.projectKey);
    error.entityId = sanitizeMigrationErrorMessage(error.entityId);
    error.message = sanitizeMigrationErrorMessage(error.message);
  }
  for (const [phase, value] of Object.entries(checkpoint.progress)) {
    if (phase === 'users') continue;
    const progress = value as Record<string, PhaseProgress>;
    for (const [rawKey, rawValue] of Object.entries(progress)) {
      const safeKey = checkpointProjectKey(rawKey);
      if (safeKey === rawKey) continue;
      const safeValue = progress[safeKey];
      progress[safeKey] = safeValue
        ? mergeProgressConservatively(safeValue, rawValue)
        : rawValue;
      delete progress[rawKey];
    }
  }
}

function mergeProgressConservatively(
  left: PhaseProgress,
  right: PhaseProgress,
): PhaseProgress {
  const statusOrder: Record<PhaseProgress['status'], number> = {
    COMPLETED: 0,
    PENDING: 1,
    IN_PROGRESS: 2,
    FAILED: 3,
  };
  const status =
    statusOrder[left.status] >= statusOrder[right.status]
      ? left.status
      : right.status;
  // A collision can only come from a legacy raw key plus its stable replacement.
  // Preserve the state that requires the most work and never overstate progress.
  return {
    ...left,
    ...right,
    status,
    completed: Math.min(left.completed, right.completed),
    total:
      left.total === null || right.total === null
        ? left.total ?? right.total
        : Math.max(left.total, right.total),
    lastPage: Math.min(left.lastPage, right.lastPage),
    lastId: null,
  };
}

export class CheckpointService {
  constructor(private readonly filePath: string) {}

  async load(): Promise<MigrationCheckpoint | null> {
    if (!existsSync(this.filePath)) return null;
    const raw = await readFile(this.filePath, 'utf-8');
    const checkpoint = JSON.parse(raw) as MigrationCheckpoint;
    normalizeCheckpointProgressKeys(checkpoint);
    return checkpoint;
  }

  async save(checkpoint: MigrationCheckpoint): Promise<void> {
    normalizeCheckpointProgressKeys(checkpoint);
    checkpoint.updatedAt = new Date().toISOString();
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(checkpoint, null, 2));
    await rename(tmpPath, this.filePath);
  }

  async markCompleted(checkpoint: MigrationCheckpoint): Promise<void> {
    checkpoint.status = 'COMPLETED';
    await this.save(checkpoint);
  }

  async updateProgress(
    checkpoint: MigrationCheckpoint,
    phase: keyof MigrationCheckpoint['progress'],
    project: string | null,
    update: Partial<PhaseProgress>,
  ): Promise<void> {
    if (project) {
      const phaseRecord = checkpoint.progress[phase] as Record<string, PhaseProgress>;
      const projectKey = checkpointProjectKey(project);
      phaseRecord[projectKey] = {
        ...(phaseRecord[projectKey] ?? {
          status: 'PENDING',
          total: null,
          completed: 0,
          lastPage: 0,
          lastId: null,
        }),
        ...update,
      };
    } else {
      (checkpoint.progress as any)[phase] = {
        ...(checkpoint.progress as any)[phase],
        ...update,
      };
    }
    await this.save(checkpoint);
  }
}
