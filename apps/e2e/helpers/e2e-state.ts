import type { ChildProcess } from 'child_process';
import type {
  StartedPostgreSqlContainer,
  StartedRedisContainer,
  StartedOpenSearchContainer,
  StartedTestContainer,
} from '@repo/test-support/containers';

export interface E2eProcessState {
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
  searchEngineContainer: StartedOpenSearchContainer;
  objectStorageContainer: StartedTestContainer;
  apiProcess: ChildProcess;
  webProcess: ChildProcess;
}

export interface E2eFileState {
  pgContainerId: string;
  redisContainerId: string;
  searchEngineContainerId: string;
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
