import type { ChildProcess } from 'child_process';
import type {
  StartedPostgreSqlContainer,
  StartedRedisContainer,
  StartedElasticsearchContainer,
  StartedTestContainer,
} from '@repo/test-support/containers';

export interface E2eProcessState {
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
  esContainer: StartedElasticsearchContainer;
  minioContainer: StartedTestContainer;
  apiProcess: ChildProcess;
  webProcess: ChildProcess;
}

export interface E2eFileState {
  pgContainerId: string;
  redisContainerId: string;
  esContainerId: string;
  apiPid: number;
  webPid: number;
  apiUrl: string;
  webUrl: string;
}

const E2E_STATE_KEY = '__e2eState';

export function setProcessState(state: E2eProcessState): void {
  (globalThis as Record<string, unknown>)[E2E_STATE_KEY] = state;
}

export function getProcessState(): E2eProcessState | undefined {
  return (globalThis as Record<string, unknown>)[E2E_STATE_KEY] as
    | E2eProcessState
    | undefined;
}
