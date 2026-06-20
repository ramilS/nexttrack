import { existsSync } from 'fs';
import { readFile, writeFile, rename } from 'fs/promises';
import {
  MigrationCheckpoint,
  PhaseProgress,
} from './checkpoint.types';

export class CheckpointService {
  constructor(private readonly filePath: string) {}

  async load(): Promise<MigrationCheckpoint | null> {
    if (!existsSync(this.filePath)) return null;
    const raw = await readFile(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async save(checkpoint: MigrationCheckpoint): Promise<void> {
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
      phaseRecord[project] = {
        ...(phaseRecord[project] ?? {
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
