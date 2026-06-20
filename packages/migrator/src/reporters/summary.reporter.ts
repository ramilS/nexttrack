import chalk from 'chalk';
import { MigrationCheckpoint } from '../checkpoint/checkpoint.types';

export class SummaryReporter {
  printSummary(checkpoint: MigrationCheckpoint, startTime: number): void {
    const durationMs = Date.now() - startTime;
    const durationStr = this.formatDuration(durationMs);

    console.log('');
    console.log(chalk.gray('─'.repeat(50)));
    console.log(
      checkpoint.status === 'COMPLETED'
        ? chalk.green.bold('MIGRATION COMPLETE')
        : chalk.red.bold(`MIGRATION ${checkpoint.status}`),
    );
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Duration:     ${durationStr}`);
    console.log(`Errors:       ${checkpoint.errors.length}`);
    console.log('');

    console.log('Summary:');
    this.printPhase('Users', checkpoint.progress.users);
    for (const [key, progress] of Object.entries(checkpoint.progress.issues)) {
      this.printPhase(`Issues [${key}]`, progress);
    }
    for (const [key, progress] of Object.entries(checkpoint.progress.comments)) {
      this.printPhase(`Comments [${key}]`, progress);
    }
    for (const [key, progress] of Object.entries(checkpoint.progress.attachments)) {
      this.printPhase(`Attachments [${key}]`, progress);
    }
    for (const [key, progress] of Object.entries(checkpoint.progress.timeLogs)) {
      this.printPhase(`Time Logs [${key}]`, progress);
    }

    if (checkpoint.errors.length > 0) {
      console.log('');
      console.log(
        chalk.yellow(
          `${checkpoint.errors.length} errors occurred. Check checkpoint file for details.`,
        ),
      );
    }
  }

  printStatus(checkpoint: MigrationCheckpoint): void {
    console.log('');
    console.log(chalk.bold('Migration Status'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Started:     ${checkpoint.startedAt}`);
    console.log(`Last update: ${checkpoint.updatedAt}`);
    console.log(`Status:      ${checkpoint.status}`);
    console.log('');
    console.log('Progress:');
    this.printPhase('Users', checkpoint.progress.users);
    for (const [key, progress] of Object.entries(checkpoint.progress.issues)) {
      this.printPhase(`Issues [${key}]`, progress);
    }
    for (const [key, progress] of Object.entries(checkpoint.progress.comments)) {
      this.printPhase(`Comments [${key}]`, progress);
    }

    console.log('');
    console.log(`Errors: ${checkpoint.errors.length}`);
  }

  private printPhase(label: string, progress: any): void {
    const total = progress.total ?? '---';
    const status =
      progress.status === 'COMPLETED'
        ? chalk.green('done')
        : progress.status === 'FAILED'
          ? chalk.red('failed')
          : progress.status === 'IN_PROGRESS'
            ? chalk.blue('in progress')
            : chalk.gray('pending');

    console.log(`  ${label.padEnd(20)} ${progress.completed}/${total}  ${status}`);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
}
