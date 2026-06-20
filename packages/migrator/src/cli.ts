#!/usr/bin/env node

import { Command } from 'commander';
import { MigrateCommand } from './commands/migrate.command';
import { StatusCommand } from './commands/status.command';
import { VerifyCommand } from './commands/verify.command';

const program = new Command();

program
  .name('youtrack-migrator')
  .description('Migrate data from YouTrack to our issue tracker')
  .version('0.1.0');

program
  .command('migrate')
  .description('Run migration from YouTrack')
  .requiredOption('--source-url <url>', 'YouTrack instance URL')
  .requiredOption('--source-token <token>', 'YouTrack permanent token')
  .requiredOption('--target-url <url>', 'Target API URL')
  .requiredOption('--target-token <token>', 'Target JWT token')
  .requiredOption('--migration-secret <secret>', 'Migration API secret')
  .option('--projects <keys>', 'Comma-separated project keys', (val: string) =>
    val.split(',').map((s) => s.trim()),
  )
  .option('--all-projects', 'Migrate all projects', false)
  .option('--with-attachments', 'Include attachments', false)
  .option('--with-time-tracking', 'Include time logs', false)
  .option('--with-boards', 'Include agile boards and sprints', false)
  .option('--with-closed-issues', 'Include resolved/closed issues', false)
  .option('--dry-run', 'Show plan without writing data', false)
  .option('--resume', 'Continue interrupted migration', false)
  .option(
    '--checkpoint-file <path>',
    'Path to checkpoint file',
    './migration-checkpoint.json',
  )
  .option('--concurrency <n>', 'Parallel requests to YouTrack', (v: string) => parseInt(v, 10), 3)
  .option('--batch-size <n>', 'Issues per page', (v: string) => parseInt(v, 10), 50)
  .option('--rate-limit <n>', 'Requests/sec to YouTrack API', (v: string) => parseInt(v, 10), 10)
  .option('--verbose', 'Detailed logging', false)
  .action(async (opts) => {
    if (!opts.projects && !opts.allProjects) {
      console.error('Error: specify --projects or --all-projects');
      process.exit(1);
    }

    const command = new MigrateCommand();
    await command.run({
      sourceUrl: opts.sourceUrl,
      sourceToken: opts.sourceToken,
      targetUrl: opts.targetUrl,
      targetToken: opts.targetToken,
      migrationSecret: opts.migrationSecret,
      projects: opts.projects ?? [],
      allProjects: opts.allProjects,
      withAttachments: opts.withAttachments,
      withTimeTracking: opts.withTimeTracking,
      withBoards: opts.withBoards,
      withClosedIssues: opts.withClosedIssues,
      dryRun: opts.dryRun,
      resume: opts.resume,
      checkpointFile: opts.checkpointFile,
      concurrency: opts.concurrency,
      batchSize: opts.batchSize,
      rateLimit: opts.rateLimit,
      verbose: opts.verbose,
    });
  });

program
  .command('status')
  .description('Show migration status from checkpoint')
  .option(
    '--checkpoint-file <path>',
    'Path to checkpoint file',
    './migration-checkpoint.json',
  )
  .action(async (opts) => {
    const command = new StatusCommand();
    await command.run({ checkpointFile: opts.checkpointFile });
  });

program
  .command('verify')
  .description('Verify migration by comparing counts')
  .requiredOption('--source-url <url>', 'YouTrack instance URL')
  .requiredOption('--source-token <token>', 'YouTrack permanent token')
  .requiredOption('--target-url <url>', 'Target API URL')
  .requiredOption('--target-token <token>', 'Target JWT token')
  .requiredOption('--migration-secret <secret>', 'Migration API secret')
  .requiredOption(
    '--projects <keys>',
    'Comma-separated project keys',
    (val: string) => val.split(',').map((s) => s.trim()),
  )
  .option('--rate-limit <n>', 'Requests/sec', (v: string) => parseInt(v, 10), 10)
  .action(async (opts) => {
    const command = new VerifyCommand();
    await command.run({
      sourceUrl: opts.sourceUrl,
      sourceToken: opts.sourceToken,
      targetUrl: opts.targetUrl,
      targetToken: opts.targetToken,
      migrationSecret: opts.migrationSecret,
      projects: opts.projects,
      rateLimit: opts.rateLimit,
    });
  });

program.parse();
