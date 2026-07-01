import { YouTrackClient } from '../youtrack/youtrack-client';
import { OurApiClient } from '../loaders/api-client';
import { IdMapService } from '../id-map/id-map.service';
import { CheckpointService } from '../checkpoint/checkpoint.service';
import {
  MigrationCheckpoint,
  MigrationConfig,
  createPhaseProgress,
} from '../checkpoint/checkpoint.types';
import { ProgressReporter } from '../reporters/progress.reporter';
import { SummaryReporter } from '../reporters/summary.reporter';

import { UsersExtractor } from '../extractors/users.extractor';
import { ProjectsExtractor } from '../extractors/projects.extractor';
import { IssuesExtractor } from '../extractors/issues.extractor';
import { CommentsExtractor } from '../extractors/comments.extractor';
import { AttachmentsExtractor } from '../extractors/attachments.extractor';
import { TimeLogsExtractor } from '../extractors/time-logs.extractor';

import { UserTransformer } from '../transformers/user.transformer';
import { IssueTransformer, UnmappedFieldReport } from '../transformers/issue.transformer';

export interface MigrateOptions {
  sourceUrl: string;
  sourceToken: string;
  targetUrl: string;
  targetToken: string;
  migrationSecret: string;
  projects: string[];
  allProjects: boolean;
  withAttachments: boolean;
  withTimeTracking: boolean;
  withBoards: boolean;
  withClosedIssues: boolean;
  dryRun: boolean;
  resume: boolean;
  checkpointFile: string;
  concurrency: number;
  batchSize: number;
  rateLimit: number;
  verbose: boolean;
}

const VERSION = '0.1.0';

// Flags whose data is extracted from YouTrack but not yet loaded into the target.
// The migration rejects them up front instead of running and silently doing
// nothing. Remove an entry here once its loading path is implemented.
const UNSUPPORTED_FLAGS: { key: 'withBoards' | 'withTimeTracking'; label: string }[] = [
  { key: 'withBoards', label: '--with-boards' },
  { key: 'withTimeTracking', label: '--with-time-tracking' },
];

export function unsupportedMigrationFlags(
  options: Pick<MigrateOptions, 'withBoards' | 'withTimeTracking'>,
): string[] {
  return UNSUPPORTED_FLAGS.filter((f) => options[f.key]).map((f) => f.label);
}

// Register the TARGET project's real workflow-status ids, keyed by status name,
// so issues resolve to a valid statusId (the FK). Name-based: the target
// project's workflow must use status names matching the YouTrack states, or the
// issue transformer falls back to the initial status.
export function registerStatusMap(
  idMap: IdMapService,
  projectKey: string,
  statuses: Array<{ id: string; name: string }>,
): void {
  for (const status of statuses) {
    idMap.registerStatus(projectKey, status.name, status.id);
  }
}

// Register the TARGET project's real custom-field ids (and enum-option ids),
// keyed by name, so custom-field values map instead of being dropped.
export function registerCustomFieldMap(
  idMap: IdMapService,
  fields: Array<{
    id: string;
    name: string;
    options: Array<{ id: string; name: string }>;
  }>,
): void {
  for (const field of fields) {
    idMap.registerCustomField(field.name, field.id);
    for (const option of field.options) {
      idMap.registerEnumOption(field.name, option.name, option.id);
    }
  }
}

export class MigrateCommand {
  private yt!: YouTrackClient;
  private api!: OurApiClient;
  private idMap!: IdMapService;
  private checkpointService!: CheckpointService;
  private reporter!: ProgressReporter;
  private summary!: SummaryReporter;

  private usersExtractor!: UsersExtractor;
  private projectsExtractor!: ProjectsExtractor;
  private issuesExtractor!: IssuesExtractor;
  private commentsExtractor!: CommentsExtractor;
  private attachmentsExtractor!: AttachmentsExtractor;
  private timeLogsExtractor!: TimeLogsExtractor;

  private userTransformer!: UserTransformer;
  private issueTransformer!: IssueTransformer;

  async run(options: MigrateOptions): Promise<void> {
    this.init(options);

    const unsupported = unsupportedMigrationFlags(options);
    if (unsupported.length > 0) {
      this.reporter.error(
        `Not implemented yet: ${unsupported.join(', ')}. These entities are ` +
          `extracted from YouTrack but not loaded into the target — remove the ` +
          `flag(s) and migrate this data separately once support lands.`,
      );
      process.exit(1);
    }

    const startTime = Date.now();
    let checkpoint: MigrationCheckpoint;

    if (options.resume) {
      const loaded = await this.checkpointService.load();
      if (!loaded) {
        this.reporter.error('No checkpoint file found. Run without --resume.');
        process.exit(1);
      }
      checkpoint = loaded;
      this.idMap = IdMapService.deserialize(checkpoint.idMap);
      this.reporter.info(`Resuming migration from ${checkpoint.updatedAt}`);
    } else {
      checkpoint = this.initCheckpoint(options);
    }

    if (options.dryRun) {
      this.reporter.warn('DRY RUN MODE — no data will be written');
    }

    this.reporter.header('YouTrack → Our System Migration');
    this.reporter.info(`Source: ${options.sourceUrl}`);
    this.reporter.info(`Target: ${options.targetUrl}`);

    // Resolve project keys if --all-projects
    if (options.allProjects) {
      const projects = await this.projectsExtractor.extractProjects();
      options.projects = projects.map((p) => p.shortName);
    }

    this.reporter.info(`Projects: ${options.projects.join(', ')}`);

    const totalSteps = this.countSteps(options);

    try {
      let step = 0;

      // Step 1: Users
      step++;
      if (checkpoint.progress.users.status !== 'COMPLETED') {
        this.reporter.section(step, totalSteps, 'Migrating Users');
        await this.migrateUsers(checkpoint, options);
      } else {
        this.reporter.skip('Users (already migrated)');
      }

      // Step 2: Projects + Workflows
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Projects + Workflows');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.projects[projectKey]?.status === 'COMPLETED') {
          this.reporter.skip(`Project ${projectKey} (already migrated)`);
          continue;
        }
        await this.migrateProject(projectKey, checkpoint, options);
      }

      // Step 3: Issues
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Issues');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.issues[projectKey]?.status === 'COMPLETED') {
          this.reporter.skip(`Issues ${projectKey} (already migrated)`);
          continue;
        }
        await this.migrateIssues(projectKey, checkpoint, options);
      }

      // Step 4: Parent links
      step++;
      this.reporter.section(step, totalSteps, 'Linking parent issues');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.parentLinks[projectKey]?.status === 'COMPLETED') {
          continue;
        }
        await this.linkParentIssues(projectKey, checkpoint, options);
      }

      // Step 5: Comments
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Comments');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.comments[projectKey]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateComments(projectKey, checkpoint, options);
      }

      // Step 6: Attachments
      if (options.withAttachments) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Attachments');
        for (const projectKey of options.projects) {
          if (checkpoint.progress.attachments[projectKey]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateAttachments(projectKey, checkpoint, options);
        }
      }

      // Step 7: Time Logs
      if (options.withTimeTracking) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Time Logs');
        for (const projectKey of options.projects) {
          if (checkpoint.progress.timeLogs[projectKey]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateTimeLogs(projectKey, checkpoint, options);
        }
      }

      await this.checkpointService.markCompleted(checkpoint);
      this.summary.printSummary(checkpoint, startTime);
    } catch (err: any) {
      checkpoint.status = 'INTERRUPTED';
      checkpoint.idMap = this.idMap.serialize();
      await this.checkpointService.save(checkpoint);
      this.reporter.error(`Migration interrupted: ${err.message}`);
      this.reporter.info('Run with --resume to continue from this point');
      process.exit(1);
    }
  }

  private init(options: MigrateOptions): void {
    this.yt = new YouTrackClient({
      url: options.sourceUrl,
      token: options.sourceToken,
      rateLimit: options.rateLimit,
    });

    this.api = new OurApiClient({
      url: options.targetUrl,
      token: options.targetToken,
      migrationSecret: options.migrationSecret,
    });

    this.idMap = new IdMapService();
    this.checkpointService = new CheckpointService(options.checkpointFile);
    this.reporter = new ProgressReporter({ verbose: options.verbose });
    this.summary = new SummaryReporter();

    this.usersExtractor = new UsersExtractor(this.yt);
    this.projectsExtractor = new ProjectsExtractor(this.yt);
    this.issuesExtractor = new IssuesExtractor(this.yt);
    this.commentsExtractor = new CommentsExtractor(this.yt);
    this.attachmentsExtractor = new AttachmentsExtractor(this.yt);
    this.timeLogsExtractor = new TimeLogsExtractor(this.yt);

    this.userTransformer = new UserTransformer();
    this.issueTransformer = new IssueTransformer((field) =>
      this.reporter.warn(this.formatUnmappedField(field)),
    );
  }

  private formatUnmappedField(field: UnmappedFieldReport): string {
    return field.reason === 'no-field-mapping'
      ? `Custom field "${field.name}" has no mapping in the target — its values are being dropped`
      : `Custom field "${field.name}": value could not be resolved (unmapped option/user) — dropping`;
  }

  private initCheckpoint(options: MigrateOptions): MigrationCheckpoint {
    return {
      version: VERSION,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {
        sourceUrl: options.sourceUrl,
        targetUrl: options.targetUrl,
        projects: options.projects,
        allProjects: options.allProjects,
        withAttachments: options.withAttachments,
        withTimeTracking: options.withTimeTracking,
        withBoards: options.withBoards,
        withClosedIssues: options.withClosedIssues,
        concurrency: options.concurrency,
        batchSize: options.batchSize,
        rateLimit: options.rateLimit,
        dryRun: options.dryRun,
      },
      status: 'RUNNING',
      idMap: {},
      progress: {
        users: createPhaseProgress(),
        projects: {},
        issues: {},
        comments: {},
        attachments: {},
        timeLogs: {},
        boards: {},
        parentLinks: {},
      },
      errors: [],
    };
  }

  private countSteps(options: MigrateOptions): number {
    let steps = 5; // users, projects, issues, parent-links, comments
    if (options.withAttachments) steps++;
    if (options.withTimeTracking) steps++;
    if (options.withBoards) steps++;
    return steps;
  }

  private recordError(
    checkpoint: MigrationCheckpoint,
    phase: string,
    entityId: string,
    err: any,
  ): void {
    const message = err?.response?.data?.message ?? err?.message ?? String(err);
    checkpoint.errors.push({
      phase,
      entityId,
      message,
      timestamp: new Date().toISOString(),
    });
    this.reporter.warn(`Error [${phase}] ${entityId}: ${message}`);
  }

  // ─── Phase implementations ───────────────────────────────────────────

  private async migrateUsers(
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'users', null, {
      status: 'IN_PROGRESS',
    });

    let completed = checkpoint.progress.users.completed;

    for await (const batch of this.usersExtractor.extract()) {
      for (const ytUser of batch) {
        if (options.dryRun) {
          this.reporter.log(`[DRY] Would create user: ${ytUser.email}`);
          completed++;
          continue;
        }

        try {
          const result = await this.api.createMigratedUser(
            this.userTransformer.transform(ytUser),
          );
          this.idMap.registerUser(ytUser.id, result.data.id);
          if (result.existed) {
            this.reporter.log(`User already exists: ${ytUser.email}`);
          }
        } catch (err) {
          this.recordError(checkpoint, 'users', ytUser.id, err);
        }

        completed++;

        if (completed % 50 === 0) {
          checkpoint.idMap = this.idMap.serialize();
          checkpoint.progress.users.completed = completed;
          await this.checkpointService.save(checkpoint);
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'users', null, {
      status: 'COMPLETED',
      completed,
      total: completed,
    });
    this.reporter.done(`Users: ${completed} migrated`);
  }

  private async migrateProject(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(
      checkpoint,
      'projects',
      projectKey,
      { status: 'IN_PROGRESS' },
    );

    const projects = await this.projectsExtractor.extractProjects([projectKey]);
    if (projects.length === 0) {
      this.reporter.warn(`Project ${projectKey} not found in YouTrack`);
      return;
    }

    // The target project (with its workflow + custom fields) must already exist
    // in NextTrack — the migrator does not create it. Register the target's REAL
    // status and custom-field ids (by name) so issues map to valid ids instead
    // of dropping. Read-only, so it runs in dry-run too (enables field/status
    // validation during a preview).
    try {
      const statuses = await this.api.getStatusMap(projectKey);
      registerStatusMap(this.idMap, projectKey, statuses);
      const fields = await this.api.getCustomFieldMap(projectKey);
      registerCustomFieldMap(this.idMap, fields);
      this.reporter.info(
        `Project ${projectKey}: registered ${statuses.length} statuses, ${fields.length} custom fields`,
      );
    } catch (err) {
      this.recordError(checkpoint, 'projects', projectKey, err);
      this.reporter.warn(
        `Project ${projectKey}: could not fetch target status/custom-field maps — ` +
          `is the project created in the target system? Statuses will fall back to ` +
          `the initial status and custom fields will be dropped.`,
      );
    }

    // Make every migrated user a member of the project, so migrated assignees
    // and USER-type custom-field values reference actual members (the app
    // enforces membership; the raw migration insert bypasses that check).
    const memberIds = this.idMap.getAllUserIds();
    if (options.dryRun) {
      this.reporter.log(
        `[DRY] Would add ${memberIds.length} members to ${projectKey}`,
      );
    } else if (memberIds.length > 0) {
      try {
        await this.api.addProjectMembers(projectKey, memberIds);
        this.reporter.info(
          `Project ${projectKey}: ${memberIds.length} users added as members`,
        );
      } catch (err) {
        this.recordError(checkpoint, 'projects', projectKey, err);
      }
    }

    checkpoint.idMap = this.idMap.serialize();
    await this.checkpointService.updateProgress(
      checkpoint,
      'projects',
      projectKey,
      { status: 'COMPLETED', completed: 1, total: 1 },
    );
    this.reporter.done(`Project ${projectKey}: maps registered`);
  }

  private async migrateIssues(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(
      checkpoint,
      'issues',
      projectKey,
      { status: 'IN_PROGRESS' },
    );

    const statusMap = this.idMap.getStatusMap(projectKey);
    let completed = checkpoint.progress.issues[projectKey]?.completed ?? 0;

    const bar = this.reporter.createBar(`Issues [${projectKey}]`);
    bar.start(0, completed);

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        if (options.dryRun) {
          this.reporter.log(`[DRY] Would create issue: ${projectKey}-${ytIssue.numberInProject}`);
          completed++;
          bar.increment();
          continue;
        }

        try {
          const dto = this.issueTransformer.transform(ytIssue, this.idMap, statusMap);
          const result = await this.api.createMigratedIssue(projectKey, dto);
          this.idMap.registerIssue(ytIssue.id, result.data.id);
          this.idMap.registerIssueByNumber(
            projectKey,
            ytIssue.numberInProject,
            ytIssue.id,
          );
        } catch (err) {
          this.recordError(checkpoint, 'issues', ytIssue.id, err);
        }

        completed++;
        bar.increment();

        if (completed % 100 === 0) {
          checkpoint.idMap = this.idMap.serialize();
          checkpoint.progress.issues[projectKey]!.completed = completed;
          await this.checkpointService.save(checkpoint);
        }
      }
    }

    bar.stop();
    await this.checkpointService.updateProgress(
      checkpoint,
      'issues',
      projectKey,
      { status: 'COMPLETED', completed, total: completed },
    );
    this.reporter.done(`Issues [${projectKey}]: ${completed} migrated`);
  }

  private async linkParentIssues(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    if (options.dryRun) {
      this.reporter.log(`[DRY] Would link parent issues for ${projectKey}`);
      return;
    }

    // Re-extract issues to get parent references
    let linked = 0;

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        if (!ytIssue.parent) continue;

        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        const ourParentId = this.idMap.getIssueId(ytIssue.parent.id);

        if (ourIssueId && ourParentId) {
          try {
            await this.api.setIssueParent(ourIssueId, ourParentId);
            linked++;
          } catch (err) {
            this.recordError(
              checkpoint,
              'parentLinks',
              ytIssue.id,
              err,
            );
          }
        }
      }
    }

    await this.checkpointService.updateProgress(
      checkpoint,
      'parentLinks',
      projectKey,
      { status: 'COMPLETED', completed: linked, total: linked },
    );
    this.reporter.done(`Linked ${linked} parent-child relationships for ${projectKey}`);
  }

  private async migrateComments(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(
      checkpoint,
      'comments',
      projectKey,
      { status: 'IN_PROGRESS' },
    );

    let completed = checkpoint.progress.comments[projectKey]?.completed ?? 0;

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        let comments;
        try {
          comments = await this.commentsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          this.recordError(checkpoint, 'comments', ytIssue.id, err);
          continue;
        }

        for (const comment of comments) {
          if (options.dryRun) {
            this.reporter.log(
              `[DRY] Would create comment on ${projectKey}-${ytIssue.numberInProject}`,
            );
            completed++;
            continue;
          }

          try {
            const authorId = this.idMap.getUserId(comment.author.id);
            if (!authorId) {
              this.reporter.log(
                `Skipping comment — author not found: ${comment.author.id}`,
              );
              continue;
            }

            const body = {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: comment.text }],
                },
              ],
            };

            await this.api.createComment(
              ourIssueId,
              authorId,
              body,
              new Date(comment.created).toISOString(),
            );
            completed++;
          } catch (err) {
            this.recordError(checkpoint, 'comments', comment.id, err);
          }
        }
      }
    }

    await this.checkpointService.updateProgress(
      checkpoint,
      'comments',
      projectKey,
      { status: 'COMPLETED', completed, total: completed },
    );
    this.reporter.done(`Comments [${projectKey}]: ${completed} migrated`);
  }

  private async migrateAttachments(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(
      checkpoint,
      'attachments',
      projectKey,
      { status: 'IN_PROGRESS' },
    );

    let completed = checkpoint.progress.attachments[projectKey]?.completed ?? 0;

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        let attachments;
        try {
          attachments = await this.attachmentsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          this.recordError(checkpoint, 'attachments', ytIssue.id, err);
          continue;
        }

        for (const att of attachments) {
          if (options.dryRun) {
            this.reporter.log(`[DRY] Would upload: ${att.name} (${att.size} bytes)`);
            completed++;
            continue;
          }

          try {
            const stream = await this.attachmentsExtractor.downloadStream(att);
            await this.api.uploadAttachmentStream(ourIssueId, att, stream);
            completed++;
          } catch (err) {
            this.recordError(checkpoint, 'attachments', att.id, err);
          }
        }
      }
    }

    await this.checkpointService.updateProgress(
      checkpoint,
      'attachments',
      projectKey,
      { status: 'COMPLETED', completed, total: completed },
    );
    this.reporter.done(`Attachments [${projectKey}]: ${completed} migrated`);
  }

  private async migrateTimeLogs(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(
      checkpoint,
      'timeLogs',
      projectKey,
      { status: 'IN_PROGRESS' },
    );

    let completed = checkpoint.progress.timeLogs[projectKey]?.completed ?? 0;

    // Time logs are loaded per-issue
    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        let timeLogs;
        try {
          timeLogs = await this.timeLogsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          this.recordError(checkpoint, 'timeLogs', ytIssue.id, err);
          continue;
        }

        for (const entry of timeLogs) {
          if (options.dryRun) {
            this.reporter.log(
              `[DRY] Would create time log: ${entry.duration?.minutes}m on ${projectKey}-${ytIssue.numberInProject}`,
            );
            completed++;
            continue;
          }

          // Time log creation is not yet in migration API
          // This would need a dedicated endpoint
          this.reporter.log(
            `Time log migration for individual entries not yet implemented via API`,
          );
          completed++;
        }
      }
    }

    await this.checkpointService.updateProgress(
      checkpoint,
      'timeLogs',
      projectKey,
      { status: 'COMPLETED', completed, total: completed },
    );
    this.reporter.done(`Time Logs [${projectKey}]: ${completed} processed`);
  }
}
