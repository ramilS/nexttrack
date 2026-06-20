export interface MigrationCheckpoint {
  version: string;
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
    attachments: Record<string, PhaseProgress>;
    timeLogs: Record<string, PhaseProgress>;
    boards: Record<string, PhaseProgress>;
    parentLinks: Record<string, PhaseProgress>;
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
  entityId: string;
  message: string;
  timestamp: string;
}

export interface MigrationConfig {
  sourceUrl: string;
  targetUrl: string;
  projects: string[];
  allProjects: boolean;
  withAttachments: boolean;
  withTimeTracking: boolean;
  withBoards: boolean;
  withClosedIssues: boolean;
  concurrency: number;
  batchSize: number;
  rateLimit: number;
  dryRun: boolean;
}

export function createPhaseProgress(): PhaseProgress {
  return {
    status: 'PENDING',
    total: null,
    completed: 0,
    lastPage: 0,
    lastId: null,
  };
}
