import { FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { type E2eFileState, getProcessState } from './helpers/e2e-state';

const STATE_FILE = path.resolve(__dirname, '.e2e-state.json');
const ENV_FILE = path.resolve(__dirname, '.env.e2e');

function killProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may have already exited
  }
}

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('\n[e2e] Tearing down...');

  // Try in-process references first
  const refs = getProcessState();
  if (refs) {
    refs.webProcess.kill('SIGTERM');
    console.log('[e2e] Stopped Next.js');

    refs.apiProcess.kill('SIGTERM');
    console.log('[e2e] Stopped NestJS API');

    await refs.pgContainer.stop();
    console.log('[e2e] Stopped PostgreSQL container');

    await refs.redisContainer.stop();
    console.log('[e2e] Stopped Redis container');

    await refs.esContainer.stop();
    console.log('[e2e] Stopped Elasticsearch container');

    await refs.minioContainer.stop();
    console.log('[e2e] Stopped MinIO container');
  } else if (fs.existsSync(STATE_FILE)) {
    // Fallback: read saved PIDs
    const state: E2eFileState = JSON.parse(
      fs.readFileSync(STATE_FILE, 'utf-8'),
    );
    if (state.webPid) killProcess(state.webPid);
    if (state.apiPid) killProcess(state.apiPid);
    console.log('[e2e] Killed server processes from state file');
  }

  // Cleanup temp files
  for (const file of [STATE_FILE, ENV_FILE]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  console.log('[e2e] Teardown complete');
}
