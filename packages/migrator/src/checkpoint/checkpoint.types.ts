import type { SafeMigrationRunConfig } from '../manifest/run-config';

export const CHECKPOINT_VERSION = '0.2.0' as const;

export interface MigrationCheckpoint {
  version: typeof CHECKPOINT_VERSION;
  runId?: string;
  configHash: string;
  startedAt: string;
  updatedAt: string;
  config: MigrationConfig;
  status: 'RUNNING' | 'INTERRUPTED' | 'COMPLETED' | 'FAILED';

  idMap: Record<string, Record<string, string>>;

  progress: {
    users: PhaseProgress;
    projects: Record<string, PhaseProgress>;
    issues: Record<string, PhaseProgress>;
    comments: Record<string, PhaseProgress>;
    tags: Record<string, PhaseProgress>;
    attachments: Record<string, PhaseProgress>;
    timeLogs: Record<string, PhaseProgress>;
    boards: Record<string, PhaseProgress>;
    parentLinks: Record<string, PhaseProgress>;
    links: Record<string, PhaseProgress>;
  };

  errors: MigrationError[];
}

export interface PhaseProgress {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  total: number | null;
  completed: number;
  lastPage: number;
  lastId: string | null;
}

export interface MigrationError {
  phase: string;
  projectKey?: string;
  entityId: string;
  message: string;
  timestamp: string;
}

export type MigrationConfig = SafeMigrationRunConfig;

export function createPhaseProgress(): PhaseProgress {
  return {
    status: 'PENDING',
    total: null,
    completed: 0,
    lastPage: 0,
    lastId: null,
  };
}
