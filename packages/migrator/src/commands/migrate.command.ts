import { YouTrackClient } from '../youtrack/youtrack-client';
import { OurApiClient } from '../loaders/api-client';
import { IdMapService } from '../id-map/id-map.service';
import {
  CheckpointService,
  checkpointPhaseKey,
  checkpointProjectKey,
} from '../checkpoint/checkpoint.service';
import {
  CHECKPOINT_VERSION,
  MigrationCheckpoint,
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
import { BoardsExtractor } from '../extractors/boards.extractor';
import {
  buildBoardColumns,
  resolveSprintStatuses,
} from '../transformers/board.transformer';
import { TeamExtractor, mapYtRole } from '../extractors/team.extractor';
import { CustomFieldDefsExtractor } from '../extractors/custom-field-defs.extractor';
import { ActivitiesExtractor } from '../extractors/activities.extractor';
import { buildCustomFieldDto, YtFieldDef } from '../transformers/custom-field-def.transformer';
import { mapActivity } from '../transformers/activity.transformer';
import { mapTagColor } from '../transformers/tag.transformer';
import { mapYtLink, resolveParentYtId } from '../transformers/link.transformer';
import { richTextToTiptap } from '../transformers/rich-text';
import { mapStatesToStatuses } from '../transformers/state.transformer';
import {
  formatHttpError,
  sanitizeMigrationErrorMessage,
} from '../utils/http-error';
import { buildRunConfig } from '../manifest/run-config';
import { MigrationRunCoordinator } from '../manifest/migration-run.coordinator';
import { migrationRunTerminalResult } from '../manifest/run-blocker';
import { canonicalEntity, CanonicalEntity } from '../manifest/manifest.types';
import { sourceChecksum } from '../manifest/stable-checksum';
import {
  ManifestEntityExecutor,
  MigrationVerificationMismatchError,
} from '../manifest/entity-executor';

import { CreateUserMigrationDto, UserTransformer } from '../transformers/user.transformer';
import { IssueTransformer, UnmappedFieldReport } from '../transformers/issue.transformer';
import { YtUser } from '../youtrack/types/yt-user.type';
import { YtIssue } from '../youtrack/types/yt-issue.type';
import axios from 'axios';
import { createHash } from 'node:crypto';

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
  estimateField?: string;
  dryRun: boolean;
  resume: boolean;
  checkpointFile: string;
  concurrency: number;
  batchSize: number;
  rateLimit: number;
  verbose: boolean;
}

export function canonicalMigratedUser(ytUser: YtUser): CanonicalEntity<CreateUserMigrationDto> {
  const transformed = new UserTransformer().transform(ytUser);
  const payload = {
    ...transformed,
    email: transformed.email.trim().toLowerCase(),
  };
  return canonicalEntity(
    {
      sourceSystem: 'youtrack-cloud',
      entityType: 'user',
      sourceId: ytUser.id,
    },
    payload,
  );
}

export async function verifyMigratedUser(
  api: OurApiClient,
  targetId: string,
  expected: CreateUserMigrationDto,
): Promise<void> {
  const actual = await api.findUserByEmail(expected.email);
  const matches =
    actual !== null &&
    actual.id === targetId &&
    actual.ytId === expected.ytId &&
    typeof actual.email === 'string' &&
    actual.email.trim().toLowerCase() === expected.email &&
    actual.name === expected.name &&
    actual.avatarUrl === expected.avatarUrl &&
    actual.isBlocked === expected.isBlocked &&
    actual.migratedFrom === expected.migratedFrom;
  if (!matches) {
    throw new MigrationVerificationMismatchError(
      `Target user does not match source user ${expected.ytId}`,
    );
  }
}

function migrationErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const body = error.response?.data;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return undefined;
  }
  const nested = body.error;
  return typeof nested === 'object' &&
    nested !== null &&
    'code' in nested &&
    typeof nested.code === 'string'
    ? nested.code
    : undefined;
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

function dryRunUuid(kind: string, projectKey: string, name: string): string {
  const hash = createHash('sha256')
    .update(`${kind}\0${projectKey}\0${name}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// A dry-run must validate the same transformer paths as a real migration, but
// must not read or create target records. Model the IDs that target creation
// would produce with deterministic UUID-shaped placeholders instead.
function registerDryRunProjectMaps(
  idMap: IdMapService,
  projectKey: string,
  states: Array<{ name: string }>,
  defs: YtFieldDef[],
): void {
  // The real target always has an initial workflow status, even if YouTrack
  // returned an empty state bundle. Preserve that fallback during validation.
  if (states.length === 0) {
    idMap.registerStatus(
      projectKey,
      '__dry_run_initial__',
      dryRunUuid('status', projectKey, '__dry_run_initial__'),
    );
  }
  for (const state of states) {
    idMap.registerStatus(projectKey, state.name, dryRunUuid('status', projectKey, state.name));
  }
  for (const def of defs) {
    if (buildCustomFieldDto(def).kind !== 'create') continue;
    idMap.registerCustomField(def.name, dryRunUuid('field', projectKey, def.name));
    for (const option of def.optionNames) {
      idMap.registerEnumOption(
        def.name,
        option,
        dryRunUuid('field-option', `${projectKey}:${def.name}`, option),
      );
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
  private boardsExtractor!: BoardsExtractor;
  private teamExtractor!: TeamExtractor;
  private fieldDefsExtractor!: CustomFieldDefsExtractor;
  private activitiesExtractor!: ActivitiesExtractor;

  private userTransformer!: UserTransformer;
  private issueTransformer!: IssueTransformer;
  private async *phaseIssues(
    projectKey: string,
    options: MigrateOptions,
    checkpoint: MigrationCheckpoint,
    phase: string,
  ): AsyncGenerator<YtIssue[]> {
    // Do not materialize a whole tenant in dry-run memory. Each dependent
    // source phase replays the bounded issue extractor, trading read requests
    // for the same memory profile as a real migration.
    try {
      yield* this.issuesExtractor.extract(projectKey, {
        withClosedIssues: options.withClosedIssues,
        batchSize: options.batchSize,
      });
    } catch (err) {
      await this.recordError(checkpoint, phase, projectKey, err, projectKey);
    }
  }

  async run(options: MigrateOptions): Promise<void> {
    const initialConfig = buildRunConfig(options);
    options.sourceUrl = initialConfig.sourceUrl;
    options.targetUrl = initialConfig.targetUrl;
    this.init(options);

    const startTime = Date.now();
    let checkpoint: MigrationCheckpoint | null = null;

    if (options.dryRun && options.resume) {
      throw new Error('--dry-run cannot be combined with --resume');
    }

    if (options.resume) {
      const loaded = await this.checkpointService.load();
      if (!loaded) {
        this.reporter.error('No checkpoint file found. Run without --resume.');
        process.exit(1);
      }
      if (
        loaded.version !== CHECKPOINT_VERSION ||
        typeof loaded.runId !== 'string' ||
        loaded.runId.length === 0 ||
        typeof loaded.configHash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(loaded.configHash)
      ) {
        throw new Error(
          'Cannot resume this pre-0.2 or incompatible checkpoint: version 0.2.0 with runId and configHash is required. Start a new manifest-backed run without --resume.',
        );
      }
      checkpoint = loaded;
      // Checkpoints written before the tags phase existed lack this key.
      checkpoint.progress.tags ??= {};
      this.idMap = IdMapService.deserialize(checkpoint.idMap);
      this.reporter.info(`Resuming migration from ${checkpoint.updatedAt}`);
    }

    if (options.dryRun) {
      this.reporter.warn('DRY RUN MODE — no data will be written');
    }

    this.reporter.header('YouTrack → Our System Migration');
    this.reporter.info(`Source: ${options.sourceUrl}`);
    this.reporter.info(`Target: ${options.targetUrl}`);

    if (options.dryRun) {
      checkpoint ??= this.initDryRunCheckpoint(options);
      await this.checkpointService.save(checkpoint);
      try {
        if (options.allProjects) {
          const projects = await this.projectsExtractor.extractProjects();
          options.projects = projects.map((project) => project.shortName);
        }
        options.projects = buildRunConfig(options).projects;
        this.reporter.info(`Projects: ${options.projects.join(', ')}`);
        checkpoint.config = buildRunConfig(options);
        checkpoint.configHash = sourceChecksum(checkpoint.config);
        await this.checkpointService.save(checkpoint);
        await this.runDryRun(checkpoint, options, startTime);
      } catch (error) {
        checkpoint.status = 'FAILED';
        await this.recordError(checkpoint, 'dry-run', 'command', error);
        this.summary.printSummary(checkpoint, startTime);
        process.exitCode = 1;
      }
      return;
    }

    // Resolve project keys if --all-projects
    if (options.allProjects) {
      const projects = await this.projectsExtractor.extractProjects();
      options.projects = projects.map((project) => project.shortName);
    }
    options.projects = buildRunConfig(options).projects;
    this.reporter.info(`Projects: ${options.projects.join(', ')}`);

    const run = await new MigrationRunCoordinator(this.api).open(options, checkpoint);
    this.reporter.info(`Migration run ID: ${run.runId}`);
    if (!checkpoint) {
      checkpoint = this.initCheckpoint(options, run);
      await this.checkpointService.save(checkpoint);
    }

    const totalSteps = this.countSteps(options);

    try {
      let step = 0;

      // Step 1: Users
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Users');
      await this.migrateUsers(checkpoint, options, run.runId);
      await this.ensureFallbackUser(options);

      // Step 2: Projects + Workflows
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Projects + Workflows');
      this.prepareLegacyPhaseAttempt(checkpoint, 'projects', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.projects[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          this.reporter.skip(`Project ${projectKey} (already migrated)`);
          continue;
        }
        await this.migrateProject(projectKey, checkpoint, options);
      }

      // Step 3: Issues
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Issues');
      this.prepareLegacyPhaseAttempt(checkpoint, 'issues', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.issues[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          this.reporter.skip(`Issues ${projectKey} (already migrated)`);
          continue;
        }
        await this.migrateIssues(projectKey, checkpoint, options);
      }

      // Step 4: Parent links
      step++;
      this.reporter.section(step, totalSteps, 'Linking parent issues');
      this.prepareLegacyPhaseAttempt(checkpoint, 'parentLinks', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.parentLinks[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          continue;
        }
        await this.linkParentIssues(projectKey, checkpoint, options);
      }

      // Step 5: Issue links (non-parent)
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Links');
      this.prepareLegacyPhaseAttempt(checkpoint, 'links', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.links[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateLinks(projectKey, checkpoint, options);
      }

      // Step 6: Tags
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Tags');
      this.prepareLegacyPhaseAttempt(checkpoint, 'tags', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.tags[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateTags(projectKey, checkpoint, options);
      }

      // Step 7: Comments
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Comments');
      this.prepareLegacyPhaseAttempt(checkpoint, 'comments', options.projects);
      for (const projectKey of options.projects) {
        if (checkpoint.progress.comments[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateComments(projectKey, checkpoint, options);
      }

      // Change history — the per-field audit trail (status/assignee/field
      // changes over time) needed for incident investigation. Idempotent per
      // issue; inserting activity rows doesn't touch the issue's updated_at.
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Change History');
      checkpoint.errors = checkpoint.errors.filter((error) => error.phase !== 'history');
      for (const projectKey of options.projects) {
        await this.migrateHistory(projectKey, checkpoint, options);
      }

      // Step 8: Attachments
      if (options.withAttachments) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Attachments');
        this.prepareLegacyPhaseAttempt(checkpoint, 'attachments', options.projects);
        for (const projectKey of options.projects) {
          if (checkpoint.progress.attachments[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateAttachments(projectKey, checkpoint, options);
        }
      }

      // Step 9: Time Logs
      if (options.withTimeTracking) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Time Logs');
        this.prepareLegacyPhaseAttempt(checkpoint, 'timeLogs', options.projects);
        for (const projectKey of options.projects) {
          if (checkpoint.progress.timeLogs[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateTimeLogs(projectKey, checkpoint, options);
        }
      }

      // Step 10: Boards + sprints
      if (options.withBoards) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Boards + Sprints');
        this.prepareLegacyPhaseAttempt(checkpoint, 'boards', options.projects);
        for (const projectKey of options.projects) {
          if (checkpoint.progress.boards[checkpointProjectKey(projectKey)]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateBoards(projectKey, checkpoint, options);
        }
      }

      // Restore original timestamps. Later phases (parent links, time logs,
      // sprint membership) update the issue row via Prisma, whose @updatedAt
      // clobbers the backdated updated_at with the migration-run time — so the
      // ES-backed list (sorted by updated) shows every touched issue as "just
      // now". Re-stamp created/updated from the source. Runs BEFORE reindex so
      // ES picks up the corrected values.
      step++;
      this.reporter.section(step, totalSteps, 'Restoring timestamps');
      checkpoint.errors = checkpoint.errors.filter((error) => error.phase !== 'timestamps');
      for (const projectKey of options.projects) {
        await this.restoreTimestamps(projectKey, checkpoint, options);
      }

      // Reindex is retried as a whole after manifest completion. A prior queue
      // failure is historical once this pass reaches the gate; current failures
      // are recorded again by the reindex loop below.
      checkpoint.errors = checkpoint.errors.filter((error) => error.phase !== 'reindex');

      // Legacy phases are not manifest-backed yet. Never let a user-only
      // manifest completion conceal a failure already recorded by those phases.
      if (checkpoint.errors.length > 0) {
        const manifest = await this.api.getMigrationRun(run.runId);
        checkpoint.status = 'FAILED';
        checkpoint.idMap = this.idMap.serialize();
        await this.checkpointService.save(checkpoint);
        this.summary.printSummary(checkpoint, startTime, manifest);
        process.exitCode = 1;
        return;
      }

      let manifest;
      try {
        manifest = await this.api.completeMigrationRun(run.runId);
      } catch (error) {
        if (migrationErrorCode(error) !== 'MIGRATION_RUN_INCOMPLETE') {
          throw error;
        }
        manifest = await this.api.getMigrationRun(run.runId);
        checkpoint.status = 'FAILED';
        checkpoint.idMap = this.idMap.serialize();
        await this.checkpointService.save(checkpoint);
        this.reporter.error(
          'Migration manifest is incomplete; resolve failed or unverified entities before reindexing.',
        );
        this.summary.printSummary(checkpoint, startTime, manifest);
        process.exitCode = 1;
        return;
      }

      // Final step: trigger a background reindex per project. Migration writes
      // issues directly (bypassing the per-issue indexer hooks), so without this
      // the imported issues won't appear in the ES-backed issue list. Async: the
      // search-indexing worker rebuilds the index off the request path.
      step++;
      this.reporter.section(step, totalSteps, 'Scheduling search reindex');
      const errorsBeforeReindex = checkpoint.errors.length;
      if (options.dryRun) {
        this.reporter.log('[DRY] Would schedule a reindex per project');
      } else {
        for (const projectKey of options.projects) {
          try {
            await this.api.reindexProject(projectKey);
            this.reporter.info(`Reindex queued for ${projectKey}`);
          } catch (err) {
            await this.recordError(checkpoint, 'reindex', projectKey, err, projectKey);
          }
        }
      }

      if (checkpoint.errors.length > errorsBeforeReindex) {
        checkpoint.status = 'FAILED';
        checkpoint.idMap = this.idMap.serialize();
        await this.checkpointService.save(checkpoint);
        this.summary.printSummary(checkpoint, startTime, manifest);
        process.exitCode = 1;
        return;
      }

      await this.checkpointService.markCompleted(checkpoint);
      this.summary.printSummary(checkpoint, startTime, manifest);
    } catch (err: any) {
      const terminal = migrationRunTerminalResult(err);
      checkpoint.status = 'INTERRUPTED';
      checkpoint.idMap = this.idMap.serialize();
      await this.checkpointService.save(checkpoint);
      this.reporter.error(terminal.terminalMessage);
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
    this.boardsExtractor = new BoardsExtractor(this.yt);
    this.teamExtractor = new TeamExtractor(this.yt);
    this.fieldDefsExtractor = new CustomFieldDefsExtractor(this.yt);
    this.activitiesExtractor = new ActivitiesExtractor(this.yt);

    this.userTransformer = new UserTransformer();
    this.issueTransformer = new IssueTransformer((field) =>
      this.reporter.warn(this.formatUnmappedField(field)),
    );
  }

  private formatUnmappedField(field: UnmappedFieldReport): string {
    switch (field.reason) {
      case 'no-field-mapping':
        return `Custom field "${field.name}" has no mapping in the target — its values are being dropped`;
      case 'unresolved-user':
        return `User "${field.name}" is not in the migrated set (deleted in YouTrack?) — crediting the migration ghost user`;
      case 'estimate-unit-mismatch':
        return `Estimate field "${field.name}" is a time period (minutes) but the target estimate is story points — storing raw minutes`;
      default:
        return `Custom field "${field.name}": value could not be resolved (unmapped option/user) — dropping`;
    }
  }

  // The ghost user absorbs authorship of content whose source account no longer
  // exists in YouTrack. Named "Deleted User" to mirror how YouTrack itself
  // renders removed accounts. Idempotent by email; survives --resume via the id-map.
  private async ensureFallbackUser(options: MigrateOptions): Promise<void> {
    if (options.dryRun || this.idMap.getFallbackUserId()) return;
    try {
      const result = await this.api.createMigratedUser({
        email: 'deleted.user@migrated.local',
        name: 'Deleted User',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
        ytId: 'migration-ghost',
      });
      this.idMap.setFallbackUserId(result.data.id);
    } catch (err: any) {
      this.reporter.warn(
        `Could not create the migration ghost user: ${formatHttpError(err)}. ` +
          `Issues from deleted YouTrack accounts will fail to migrate.`,
      );
    }
  }

  private initCheckpoint(
    options: MigrateOptions,
    run: { runId: string; configHash: string },
  ): MigrationCheckpoint {
    return {
      version: CHECKPOINT_VERSION,
      runId: run.runId,
      configHash: run.configHash,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: buildRunConfig(options),
      status: 'RUNNING',
      idMap: {},
      progress: {
        users: createPhaseProgress(),
        projects: {},
        issues: {},
        comments: {},
        tags: {},
        attachments: {},
        timeLogs: {},
        boards: {},
        parentLinks: {},
        links: {},
      },
      errors: [],
    };
  }

  private initDryRunCheckpoint(options: MigrateOptions): MigrationCheckpoint {
    const config = buildRunConfig(options);
    return {
      version: CHECKPOINT_VERSION,
      configHash: sourceChecksum(config),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config,
      status: 'RUNNING',
      idMap: {},
      progress: {
        users: createPhaseProgress(),
        projects: {}, issues: {}, comments: {}, tags: {}, attachments: {},
        timeLogs: {}, boards: {}, parentLinks: {}, links: {},
      },
      errors: [],
    };
  }

  private async runDryRun(
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
    startTime: number,
  ): Promise<void> {
    await this.migrateUsers(checkpoint, options);
    for (const projectKey of options.projects) {
      await this.migrateProject(projectKey, checkpoint, options);
      await this.migrateIssues(projectKey, checkpoint, options);
      await this.linkParentIssues(projectKey, checkpoint, options);
      await this.migrateLinks(projectKey, checkpoint, options);
      await this.migrateTags(projectKey, checkpoint, options);
      await this.migrateComments(projectKey, checkpoint, options);
      await this.migrateHistory(projectKey, checkpoint, options);
      if (options.withAttachments) {
        await this.migrateAttachments(projectKey, checkpoint, options);
      }
      if (options.withTimeTracking) {
        await this.migrateTimeLogs(projectKey, checkpoint, options);
      }
      if (options.withBoards) {
        await this.migrateBoards(projectKey, checkpoint, options);
      }
      await this.restoreTimestamps(projectKey, checkpoint, options);
    }
    checkpoint.status = checkpoint.errors.length === 0 ? 'COMPLETED' : 'FAILED';
    checkpoint.idMap = this.idMap.serialize();
    await this.checkpointService.save(checkpoint);
    this.summary.printSummary(checkpoint, startTime);
    if (checkpoint.status === 'FAILED') process.exitCode = 1;
  }

  private countSteps(options: MigrateOptions): number {
    // users, projects, issues, parent-links, links, tags, comments, history,
    // restore-timestamps, reindex
    let steps = 10;
    if (options.withAttachments) steps++;
    if (options.withTimeTracking) steps++;
    if (options.withBoards) steps++;
    return steps;
  }

  private prepareLegacyPhaseAttempt(
    checkpoint: MigrationCheckpoint,
    phase: Exclude<keyof MigrationCheckpoint['progress'], 'users'>,
    projects: string[],
  ): void {
    const historical = checkpoint.errors.filter((error) => error.phase === phase);
    if (historical.length > 0) {
      checkpoint.errors = checkpoint.errors.filter((error) => error.phase !== phase);
    }
    const hasUnscopedLegacyError = historical.some((error) => !error.projectKey);
    const affectedProjects = new Set(
      historical.flatMap((error) =>
        error.projectKey ? [checkpointProjectKey(error.projectKey)] : [],
      ),
    );
    const progress = checkpoint.progress[phase] as Record<string, ReturnType<typeof createPhaseProgress>>;
    for (const project of projects) {
      const safeProject = checkpointProjectKey(project);
      const prior = progress[safeProject];
      if (
        hasUnscopedLegacyError ||
        affectedProjects.has(safeProject) ||
        prior?.status === 'FAILED'
      ) {
        progress[safeProject] = createPhaseProgress();
      }
    }
  }

  private phaseStatus(
    checkpoint: MigrationCheckpoint,
    phase: string,
    projectKey?: string,
  ): 'COMPLETED' | 'FAILED' {
    return checkpoint.errors.some(
      (error) =>
        error.phase === phase &&
        (!projectKey ||
          !error.projectKey ||
          checkpointProjectKey(error.projectKey) ===
            checkpointProjectKey(projectKey)),
    )
      ? 'FAILED'
      : 'COMPLETED';
  }

  // Import each issue's field-change history as backdated Activity rows. The
  // author resolves to the migrated user or the ghost ("Deleted User"). One
  // activities request per issue (bounded), idempotent server-side.
  private async migrateHistory(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    const ghost = this.idMap.getFallbackUserId();
    let created = 0;
    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'history')) {
      for (const ytIssue of batch) {
        let activities;
        try {
          activities = await this.activitiesExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          await this.recordError(checkpoint, 'history', ytIssue.id, err, projectKey);
          continue;
        }

        let entries;
        try {
          entries = activities.map(mapActivity).map((m) => ({
              type: m.type,
              actorId: (m.authorYtId && this.idMap.getUserId(m.authorYtId)) || ghost || '',
              createdAt: new Date(m.timestamp).toISOString(),
              payload: m.payload,
            }));
        } catch (err) {
          await this.recordError(checkpoint, 'history', ytIssue.id, err, projectKey);
          continue;
        }
        if (options.dryRun) {
          created += entries.length;
          this.reporter.log(
            `[DRY] Validated ${entries.length} history entries for ${projectKey}-${ytIssue.numberInProject}`,
          );
          continue;
        }
        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;
        entries = entries.filter((entry) => entry.actorId);
        if (entries.length === 0) continue;

        try {
          await this.api.createActivities(ourIssueId, entries);
          created += entries.length;
        } catch (err) {
          await this.recordError(checkpoint, 'history', ytIssue.id, err, projectKey);
        }
      }
    }
    this.reporter.info(`Change history [${projectKey}]: ${created} activities`);
  }

  // Re-stamp each issue's original created/updated from the source. Later
  // phases update the issue row (parent, time logs, sprint membership) and
  // Prisma's @updatedAt overwrites the backdated updated_at — this restores it
  // so the ES-backed list (sorted by updated) shows YouTrack's dates. Runs
  // before reindex; idempotent, so a --resume re-run is safe.
  private async restoreTimestamps(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    let restored = 0;
    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'timestamps')) {
      for (const ytIssue of batch) {
        try {
          const dates = {
            createdAt: new Date(ytIssue.created).toISOString(),
            updatedAt: new Date(ytIssue.updated).toISOString(),
            resolvedAt: ytIssue.resolved ? new Date(ytIssue.resolved).toISOString() : null,
          };
          if (options.dryRun) {
            restored++;
            continue;
          }
          const ourIssueId = this.idMap.getIssueId(ytIssue.id);
          if (!ourIssueId) continue;
          await this.api.setOriginalDates(ourIssueId, {
            ...dates,
          });
          restored++;
        } catch (err) {
          await this.recordError(checkpoint, 'timestamps', ytIssue.id, err, projectKey);
        }
      }
    }
    this.reporter.info(`Timestamps restored for ${projectKey}: ${restored}`);
  }

  private async recordError(
    checkpoint: MigrationCheckpoint,
    phase: string,
    entityId: string,
    err: any,
    projectKey?: string,
  ): Promise<void> {
    const safePhase = checkpointPhaseKey(phase);
    const safeProjectKey = projectKey
      ? checkpointProjectKey(projectKey)
      : undefined;
    const safeEntityId = sanitizeMigrationErrorMessage(entityId);
    const message = formatHttpError(err);
    checkpoint.errors.push({
      phase: safePhase,
      ...(safeProjectKey ? { projectKey: safeProjectKey } : {}),
      entityId: safeEntityId,
      message,
      timestamp: new Date().toISOString(),
    });
    this.reporter.warn(`Error [${safePhase}] ${safeEntityId}: ${message}`);
    // Persist immediately: the periodic (every-100) save can be far away, and the
    // live progress bar clobbers this warning line — so on-disk errors[] is the
    // only reliable place to read the full failure text after an interrupted run.
    checkpoint.idMap = this.idMap.serialize();
    await this.checkpointService.save(checkpoint);
  }

  // ─── Phase implementations ───────────────────────────────────────────

  private async migrateUsers(
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
    runId?: string,
  ): Promise<void> {
    // A full manifest discovery pass retries prior FAILED user rows. Historical
    // user-attempt errors must not keep a now-VERIFIED resume permanently
    // blocked; current failures are recorded again below.
    checkpoint.errors = checkpoint.errors.filter((error) => error.phase !== 'users');
    await this.checkpointService.updateProgress(checkpoint, 'users', null, {
      status: 'IN_PROGRESS',
    });

    let completed = 0;
    const errorsBefore = checkpoint.errors.length;
    const executor = runId ? new ManifestEntityExecutor(runId, this.api) : null;

    for await (const batch of this.usersExtractor.extract()) {
      for (const ytUser of batch) {
        const canonical = canonicalMigratedUser(ytUser);
        if (options.dryRun) {
          this.reporter.log(`[DRY] Would create user: ${ytUser.email}`);
          completed++;
          continue;
        }

        if (!executor) throw new Error('A server run ID is required outside dry-run mode');
        const result = await executor.execute(canonical, {
          transform: () => ({
            ...this.userTransformer.transform(ytUser),
            email: canonical.payload.email,
          }),
          load: async (value) => {
            const loaded = await this.api.createMigratedUser(value);
            if (loaded.existed) {
              this.reporter.log(`User already exists: ${value.email}`);
            }
            return { targetId: loaded.data.id };
          },
          verify: (targetId, value) => verifyMigratedUser(this.api, targetId, value),
        });
        if (result.status === 'VERIFIED') {
          this.idMap.registerUser(ytUser.id, result.targetId);
        } else {
          await this.recordError(checkpoint, 'users', ytUser.id, new Error(result.error));
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
      status: checkpoint.errors.length === errorsBefore ? 'COMPLETED' : 'FAILED',
      completed,
      total: completed,
    });
    this.reporter.done(
      options.dryRun
        ? `[DRY] Users: ${completed} extracted and transformed; none written`
        : `Users: ${completed} processed (legacy checkpoint counter)`,
    );
  }

  // Derive the project's custom-field definitions from YouTrack and create the
  // genuine ones in the target (idempotent by name). Skips first-class fields
  // and bundle fields with no observed values / unsupported types, reporting a
  // one-line summary. Values are mapped later via the registered field map.
  private async createCustomFields(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<YtFieldDef[]> {
    let defs: YtFieldDef[];
    try {
      defs = await this.fieldDefsExtractor.collect(projectKey);
    } catch (err) {
      // Non-fatal: without field defs, custom-field VALUES drop, but issues
      // (and their first-class Type/State/Assignee/Priority, read per-issue)
      // still migrate. Record and skip rather than abort the whole run.
      await this.recordError(checkpoint, 'projects', `${projectKey}:field-defs`, err, projectKey);
      return [];
    }
    let created = 0;
    const skipped: string[] = [];

    for (const def of defs) {
      const result = buildCustomFieldDto(def);
      if (result.kind === 'skip') {
        if (result.reason !== 'first-class') skipped.push(`${def.name} (${result.reason})`);
        continue;
      }
      if (options.dryRun) {
        this.reporter.log(`[DRY] Would create custom field ${def.name} (${result.dto.type})`);
        created++;
        continue;
      }
      try {
        await this.api.createCustomField(projectKey, result.dto);
        created++;
      } catch (err) {
        await this.recordError(checkpoint, 'projects', `${projectKey}:field:${def.name}`, err, projectKey);
      }
    }

    this.reporter.info(
      `Project ${projectKey}: ${created} custom fields provisioned` +
        (skipped.length ? `, skipped ${skipped.join(', ')}` : ''),
    );
    return defs;
  }

  private async migrateProject(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    const safeProjectKey = sanitizeMigrationErrorMessage(projectKey);
    await this.checkpointService.updateProgress(checkpoint, 'projects', projectKey, {
      status: 'IN_PROGRESS',
    });

    const projects = await this.projectsExtractor.extractProjects([projectKey]);
    if (projects.length === 0) {
      this.reporter.warn(`Project ${safeProjectKey} not found in YouTrack`);
      await this.recordError(
        checkpoint,
        'projects',
        projectKey,
        new Error('Requested source project was not found'),
        projectKey,
      );
      await this.checkpointService.updateProgress(
        checkpoint,
        'projects',
        projectKey,
        { status: 'FAILED', completed: 0, total: 0 },
      );
      return;
    }

    const ytProject = projects[0]!;

    // Create the target project (idempotent by key) with a workflow provisioned
    // from the YouTrack states, so statuses map by name. Skipped in dry-run.
    const states = await this.projectsExtractor.getStates(ytProject.id);
    if (options.dryRun) {
      this.reporter.log(
        `[DRY] Would ensure project ${projectKey} exists (${states.length} states)`,
      );
    } else {
      try {
        await this.api.createProject({
          key: projectKey,
          name: ytProject.name,
          description: ytProject.description ?? null,
          statuses: mapStatesToStatuses(states),
        });
      } catch (err) {
        await this.recordError(checkpoint, 'projects', projectKey, err, projectKey);
      }
    }

    // Provision the project's custom fields in the target BEFORE reading the
    // field map below — so YouTrack custom-field values map onto real fields
    // instead of being dropped. First-class fields (Type/State/Assignee/
    // Priority) are excluded; they migrate as native Issue attributes.
    const fieldDefs = await this.createCustomFields(projectKey, checkpoint, options);

    // Register the target's REAL status and custom-field ids (by name) so issues
    // map to valid ids instead of dropping. A dry-run deliberately does not
    // create the target project, therefore it must not require those maps to
    // already exist on a clean target.
    if (options.dryRun) {
      registerDryRunProjectMaps(this.idMap, projectKey, states, fieldDefs);
      this.reporter.log(
        `[DRY] Registered virtual status and custom-field maps for ${projectKey}`,
      );
    } else {
      try {
        const statuses = await this.api.getStatusMap(projectKey);
        registerStatusMap(this.idMap, projectKey, statuses);
        const fields = await this.api.getCustomFieldMap(projectKey);
        registerCustomFieldMap(this.idMap, fields);
        this.reporter.info(
          `Project ${projectKey}: registered ${statuses.length} statuses, ${fields.length} custom fields`,
        );
      } catch (err) {
        await this.recordError(checkpoint, 'projects', projectKey, err, projectKey);
        this.reporter.warn(
          `Project ${safeProjectKey}: could not fetch target status/custom-field maps — ` +
            `is the project created in the target system? Statuses will fall back to ` +
            `the initial status and custom fields will be dropped.`,
        );
      }
    }

    // Make every migrated user a member of the project (so assignees and
    // USER-type custom-field values reference actual members — the app enforces
    // membership, which the raw migration insert bypasses), carrying each user's
    // YouTrack project role mapped to a NextTrack role (unmapped → Developer).
    const teamRoles = await this.teamExtractor.getUserRoles(ytProject.id);
    const members = this.idMap.getUserEntries().map(({ ytId, targetId }) => ({
      userId: targetId,
      roleName: mapYtRole(teamRoles.get(ytId)),
    }));
    if (options.dryRun) {
      this.reporter.log(`[DRY] Would add ${members.length} members to ${projectKey}`);
    } else if (members.length > 0) {
      try {
        await this.api.addProjectMembers(projectKey, members);
        this.reporter.info(`Project ${projectKey}: ${members.length} users added as members`);
      } catch (err) {
        await this.recordError(checkpoint, 'projects', projectKey, err, projectKey);
      }
    }

    checkpoint.idMap = this.idMap.serialize();
    await this.checkpointService.updateProgress(checkpoint, 'projects', projectKey, {
      status: this.phaseStatus(checkpoint, 'projects', projectKey),
      completed: 1,
      total: 1,
    });
    this.reporter.done(`Project ${projectKey}: maps registered`);
  }

  private async migrateIssues(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'issues', projectKey, {
      status: 'IN_PROGRESS',
    });

    const statusMap = this.idMap.getStatusMap(projectKey);
    const progressKey = checkpointProjectKey(projectKey);
    let completed = checkpoint.progress.issues[progressKey]?.completed ?? 0;

    const bar = this.reporter.createCounter(`Issues [${projectKey}]`);
    bar.start(0, completed);
    try {
      for await (const batch of this.issuesExtractor.extract(projectKey, {
        withClosedIssues: options.withClosedIssues,
        batchSize: options.batchSize,
      })) {
        for (const ytIssue of batch) {
          try {
            const dto = this.issueTransformer.transform(ytIssue, this.idMap, statusMap, {
              estimateFieldName: options.estimateField,
            });
            if (options.dryRun) {
              this.reporter.log(
                `[DRY] Validated issue: ${projectKey}-${ytIssue.numberInProject}`,
              );
            } else {
              const result = await this.api.createMigratedIssue(projectKey, dto);
              this.idMap.registerIssue(ytIssue.id, result.data.id);
              this.idMap.registerIssueByNumber(
                projectKey,
                ytIssue.numberInProject,
                ytIssue.id,
              );
            }
          } catch (err) {
            await this.recordError(checkpoint, 'issues', ytIssue.id, err, projectKey);
          }

          completed++;
          bar.increment();

          if (completed % 100 === 0) {
            checkpoint.idMap = this.idMap.serialize();
            checkpoint.progress.issues[progressKey]!.completed = completed;
            await this.checkpointService.save(checkpoint);
          }
        }
      }
    } catch (err) {
      await this.recordError(checkpoint, 'issues', projectKey, err, projectKey);
    }

    bar.stop();
    await this.checkpointService.updateProgress(checkpoint, 'issues', projectKey, {
      status: this.phaseStatus(checkpoint, 'issues', projectKey),
      completed,
      total: completed,
    });
    this.reporter.done(`Issues [${projectKey}]: ${completed} migrated`);
  }

  private async linkParentIssues(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    // Re-extract issues to resolve parent references. YouTrack has no native
    // parent field — the top-level `Issue.parent` is an IssueLink wrapper whose
    // id is the LINK id, not the parent issue. Hierarchy is the INWARD "Subtask"
    // link, resolved via resolveParentYtId.
    let linked = 0;

    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'parentLinks')) {
      for (const ytIssue of batch) {
        let parentYtId: string | null;
        try {
          parentYtId = resolveParentYtId(ytIssue.links);
        } catch (err) {
          await this.recordError(checkpoint, 'parentLinks', ytIssue.id, err, projectKey);
          continue;
        }
        if (!parentYtId) continue;

        if (options.dryRun) {
          linked++;
          this.reporter.log(
            `[DRY] Validated parent link ${ytIssue.id} → ${parentYtId}`,
          );
          continue;
        }

        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        const ourParentId = this.idMap.getIssueId(parentYtId);

        if (ourIssueId && ourParentId) {
          try {
            await this.api.setIssueParent(ourIssueId, ourParentId);
            linked++;
          } catch (err) {
            await this.recordError(checkpoint, 'parentLinks', ytIssue.id, err, projectKey);
          }
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'parentLinks', projectKey, {
      status: this.phaseStatus(checkpoint, 'parentLinks', projectKey),
      completed: linked,
      total: linked,
    });
    this.reporter.done(`Linked ${linked} parent-child relationships for ${projectKey}`);
  }

  // Non-parent issue links. Runs after all issues exist so both endpoints of
  // every link resolve via the id-map. The server enforces uniqueness and
  // dependency-cycle safety, so duplicate/cyclic links surface as recorded
  // errors rather than aborting the migration.
  private async migrateLinks(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'links', projectKey, {
      status: 'IN_PROGRESS',
    });

    let linked = 0;

    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'links')) {
      for (const ytIssue of batch) {
        try {
          const links = ytIssue.links ?? [];
          if (links.length === 0) continue;

          const sourceId = options.dryRun ? ytIssue.id : this.idMap.getIssueId(ytIssue.id);
          if (!sourceId) continue;

          for (const link of links) {
            const type = mapYtLink(link.linkType.name, link.direction);
            if (!type) continue; // unknown type, subtask, or inward-symmetric

            for (const target of link.issues ?? []) {
              const targetId = options.dryRun ? target.id : this.idMap.getIssueId(target.id);
              if (!targetId || targetId === sourceId) continue;

              if (options.dryRun) {
                this.reporter.log(
                  `[DRY] Would link ${projectKey}-${ytIssue.numberInProject}: ${type} → ${target.id}`,
                );
                linked++;
                continue;
              }

              try {
                await this.api.createIssueLink(sourceId, {
                  type,
                  targetIssueId: targetId,
                });
                linked++;
              } catch (err) {
                await this.recordError(checkpoint, 'links', ytIssue.id, err, projectKey);
              }
            }
          }
        } catch (err) {
          await this.recordError(checkpoint, 'links', ytIssue.id, err, projectKey);
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'links', projectKey, {
      status: this.phaseStatus(checkpoint, 'links', projectKey),
      completed: linked,
      total: linked,
    });
    this.reporter.done(`Links [${projectKey}]: ${linked} created`);
  }

  private async migrateTags(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'tags', projectKey, {
      status: 'IN_PROGRESS',
    });

    let tagged = 0;

    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'tags')) {
      for (const ytIssue of batch) {
        const ytTags = ytIssue.tags ?? [];
        if (ytTags.length === 0) continue;

        if (options.dryRun) {
          try {
            for (const tag of ytTags) mapTagColor(tag.color);
            this.reporter.log(
              `[DRY] Would tag ${projectKey}-${ytIssue.numberInProject}: ` +
                ytTags.map((t) => t.name).join(', '),
            );
          } catch (err) {
            await this.recordError(checkpoint, 'tags', ytIssue.id, err, projectKey);
          }
          continue;
        }

        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        try {
          const tagIds: string[] = [];
          for (const ytTag of ytTags) {
            // Tag creation is deduped via the id-map, so each unique tag name
            // costs one API call per project, not one per issue.
            let tagId = this.idMap.getTagId(projectKey, ytTag.name);
            if (!tagId) {
              const result = await this.api.createTag(projectKey, {
                name: ytTag.name,
                color: mapTagColor(ytTag.color),
              });
              tagId = result.data.id;
              this.idMap.registerTag(projectKey, ytTag.name, tagId);
            }
            tagIds.push(tagId);
          }
          await this.api.linkIssueTags(ourIssueId, [...new Set(tagIds)]);
          tagged++;
        } catch (err) {
          await this.recordError(checkpoint, 'tags', ytIssue.id, err, projectKey);
        }
      }
      checkpoint.idMap = this.idMap.serialize();
      await this.checkpointService.save(checkpoint);
    }

    await this.checkpointService.updateProgress(checkpoint, 'tags', projectKey, {
      status: this.phaseStatus(checkpoint, 'tags', projectKey),
      completed: tagged,
      total: tagged,
    });
    this.reporter.done(`Tags [${projectKey}]: ${tagged} issues tagged`);
  }

  private async migrateComments(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'comments', projectKey, {
      status: 'IN_PROGRESS',
    });

    let completed = checkpoint.progress.comments[checkpointProjectKey(projectKey)]?.completed ?? 0;

    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'comments')) {
      for (const ytIssue of batch) {
        let comments;
        try {
          comments = await this.commentsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          await this.recordError(checkpoint, 'comments', ytIssue.id, err, projectKey);
          continue;
        }

        for (const comment of comments) {
          try {
            const body = richTextToTiptap(comment.text, {
              resolveUserMention: (id) =>
                options.dryRun ? null : this.idMap.getUserId(id) ?? null,
            });
            const createdAt = new Date(comment.created).toISOString();
            if (!comment.id || !comment.author?.id) {
              throw new Error('Comment source identity or author is missing');
            }
            if (options.dryRun) {
              void body;
              this.reporter.log(
                `[DRY] Validated comment on ${projectKey}-${ytIssue.numberInProject}`,
              );
              completed++;
              continue;
            }
            const ourIssueId = this.idMap.getIssueId(ytIssue.id);
            if (!ourIssueId) continue;
            const authorId =
              this.idMap.getUserId(comment.author.id) ?? this.idMap.getFallbackUserId();
            if (!authorId) {
              this.reporter.log(`Skipping comment — author not found: ${comment.author.id}`);
              continue;
            }

            await this.api.createComment(
              ourIssueId,
              authorId,
              body,
              createdAt,
            );
            completed++;
          } catch (err) {
            await this.recordError(checkpoint, 'comments', comment.id, err, projectKey);
          }
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'comments', projectKey, {
      status: this.phaseStatus(checkpoint, 'comments', projectKey),
      completed,
      total: completed,
    });
    this.reporter.done(`Comments [${projectKey}]: ${completed} migrated`);
  }

  private async migrateAttachments(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'attachments', projectKey, {
      status: 'IN_PROGRESS',
    });

    let completed = checkpoint.progress.attachments[checkpointProjectKey(projectKey)]?.completed ?? 0;

    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'attachments')) {
      for (const ytIssue of batch) {
        let attachments;
        try {
          attachments = await this.attachmentsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          await this.recordError(checkpoint, 'attachments', ytIssue.id, err, projectKey);
          continue;
        }

        if (options.dryRun) {
          for (const att of attachments) {
            try {
              if (
                !att.id || !att.name || !att.url || !att.mimeType ||
                !Number.isFinite(att.size) || att.size < 0
              ) {
                throw new Error('Attachment metadata is invalid');
              }
              new Date(att.created).toISOString();
              this.reporter.log(`[DRY] Validated attachment: ${att.name} (${att.size} bytes)`);
              completed++;
            } catch (err) {
              await this.recordError(checkpoint, 'attachments', att.id || ytIssue.id, err, projectKey);
            }
          }
          continue;
        }

        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        // Idempotency: the upload endpoint is not dedup-aware, so on a --resume
        // (or a partial retry) already-uploaded files would duplicate. Read the
        // issue's existing attachments once and skip matches by name+size.
        let existing = new Set<string>();
        if (attachments.length > 0) {
          try {
            const rows = await this.api.listAttachments(ourIssueId);
            existing = new Set(rows.map((a) => `${a.filename}:${a.size}`));
          } catch (err) {
            await this.recordError(checkpoint, 'attachments', ytIssue.id, err, projectKey);
            continue;
          }
        }

        for (const att of attachments) {
          if (existing.has(`${att.name}:${att.size}`)) {
            completed++;
            continue;
          }

          try {
            const stream = await this.attachmentsExtractor.downloadStream(att);
            // The migration endpoint stores the original author + date inline —
            // no size cap, no follow-up metadata call. Unresolved author (a
            // deleted YouTrack account) falls back to the ghost user.
            const uploadedById =
              (att.author?.id && this.idMap.getUserId(att.author.id)) ||
              this.idMap.getFallbackUserId() ||
              '';
            await this.api.uploadAttachmentStream(ourIssueId, att, stream, {
              uploadedById,
              originalCreatedAt: new Date(att.created).toISOString(),
            });
            completed++;
          } catch (err) {
            // Include file context (size/mime) so a connection reset (which
            // carries no server-side reason) still hints at the cause — an
            // oversized file, an odd type, etc.
            const kb = Math.round((att.size ?? 0) / 1024);
            await this.recordError(
              checkpoint,
              'attachments',
              `${att.id} "${att.name}" ${kb}KB ${att.mimeType}`,
              err,
              projectKey,
            );
          }
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'attachments', projectKey, {
      status: this.phaseStatus(checkpoint, 'attachments', projectKey),
      completed,
      total: completed,
    });
    this.reporter.done(`Attachments [${projectKey}]: ${completed} migrated`);
  }

  private async migrateTimeLogs(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'timeLogs', projectKey, {
      status: 'IN_PROGRESS',
    });

    let completed = checkpoint.progress.timeLogs[checkpointProjectKey(projectKey)]?.completed ?? 0;

    // Time logs are loaded per-issue
    for await (const batch of this.phaseIssues(projectKey, options, checkpoint, 'timeLogs')) {
      for (const ytIssue of batch) {
        let timeLogs;
        try {
          timeLogs = await this.timeLogsExtractor.getForIssue(ytIssue.id);
        } catch (err) {
          await this.recordError(checkpoint, 'timeLogs', ytIssue.id, err, projectKey);
          continue;
        }

        if (options.dryRun) {
          for (const entry of timeLogs) {
            try {
              if (!entry.id || !entry.author?.id || !(entry.duration?.minutes > 0)) {
                throw new Error('Time-log source row is invalid');
              }
              new Date(entry.date).toISOString();
              completed++;
            } catch (err) {
              await this.recordError(checkpoint, 'timeLogs', entry.id || ytIssue.id, err, projectKey);
            }
          }
          this.reporter.log(
            `[DRY] Validated ${timeLogs.length} time logs on ${projectKey}-${ytIssue.numberInProject}`,
          );
          continue;
        }

        const ourIssueId = this.idMap.getIssueId(ytIssue.id);
        if (!ourIssueId) continue;

        // Author falls back to the ghost user; entries with no resolvable
        // author (and no ghost) or a non-positive duration are dropped.
        const entries = timeLogs
          .filter((entry) => (entry.duration?.minutes ?? 0) > 0)
          .map((entry) => ({
            userId: this.idMap.getUserId(entry.author.id) ?? this.idMap.getFallbackUserId(),
            minutes: entry.duration.minutes,
            date: new Date(entry.date).toISOString(),
            description: entry.text ?? null,
          }))
          .filter((entry): entry is { userId: string } & typeof entry => entry.userId !== null);

        if (entries.length === 0) continue;

        try {
          await this.api.createTimeLogs(ourIssueId, entries);
          completed += entries.length;
        } catch (err) {
          await this.recordError(checkpoint, 'timeLogs', ytIssue.id, err, projectKey);
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'timeLogs', projectKey, {
      status: this.phaseStatus(checkpoint, 'timeLogs', projectKey),
      completed,
      total: completed,
    });
    this.reporter.done(`Time Logs [${projectKey}]: ${completed} processed`);
  }

  // Each YouTrack agile board becomes one SCRUM board (so sprints can hold
  // issues). Board columns are rebuilt from the source columnSettings so the
  // target board matches the YouTrack layout (and hides issues in states that
  // have no column, e.g. Released). Sprints run after all issues exist, so their
  // membership resolves via the id-map; each sprint's final status (archived →
  // CLOSED, current → ACTIVE) is set AFTER its issues are added, because the API
  // rejects adding issues to a CLOSED sprint and always creates one as PLANNING.
  private async migrateBoards(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'boards', projectKey, {
      status: 'IN_PROGRESS',
    });

    let sprintsCreated = 0;
    let ytBoards;
    try {
      ytBoards = await this.boardsExtractor.extractForProject(projectKey);
    } catch (err) {
      await this.recordError(checkpoint, 'boards', projectKey, err, projectKey);
      await this.checkpointService.updateProgress(checkpoint, 'boards', projectKey, {
        status: 'FAILED', completed: 0, total: 0,
      });
      return;
    }

    for (const ytBoard of ytBoards) {
      if (options.dryRun) {
        try {
          if (!ytBoard.id || !ytBoard.name) throw new Error('Board source metadata is invalid');
          for (const sprint of ytBoard.sprints ?? []) {
            if (!sprint.id || !sprint.name) throw new Error('Sprint source metadata is invalid');
            if (sprint.start !== undefined) new Date(sprint.start).toISOString();
            if (sprint.finish !== undefined) new Date(sprint.finish).toISOString();
            for (const issue of sprint.issues ?? []) {
              if (!issue.id) throw new Error('Sprint issue source identity is missing');
            }
            sprintsCreated++;
          }
          this.reporter.log(
            `[DRY] Validated board "${ytBoard.name}" with ${ytBoard.sprints?.length ?? 0} sprints`,
          );
        } catch (err) {
          await this.recordError(checkpoint, 'boards', ytBoard.id || projectKey, err, projectKey);
        }
        continue;
      }

      try {
        const boardId = await this.api.createBoard(projectKey, {
          name: ytBoard.name,
          type: 'SCRUM',
        });

        const columns = buildBoardColumns(ytBoard, (stateName) =>
          this.idMap.getStatusId(projectKey, stateName),
        );
        if (columns.length > 0) {
          await this.api.setBoardColumns(projectKey, boardId, columns);
        }

        const sprints = ytBoard.sprints ?? [];
        const statuses = resolveSprintStatuses(
          sprints,
          new Date(),
          ytBoard.currentSprint?.id,
        );

        for (const ytSprint of sprints) {
          const sprintId = await this.api.createSprint(boardId, {
            name: ytSprint.name,
            // YouTrack returns goal: null (not absent) → coerce, since the
            // target schema's goal is optional-but-not-nullable.
            goal: ytSprint.goal || undefined,
            startDate: ytSprint.start ? new Date(ytSprint.start).toISOString() : undefined,
            endDate: ytSprint.finish ? new Date(ytSprint.finish).toISOString() : undefined,
          });
          sprintsCreated++;

          const issueIds = (ytSprint.issues ?? [])
            .map((issue) => this.idMap.getIssueId(issue.id))
            .filter((id): id is string => id !== null);
          if (issueIds.length > 0) {
            await this.api.addSprintIssues(boardId, sprintId, issueIds);
          }

          const status = statuses.get(ytSprint.id);
          if (status && status !== 'PLANNING') {
            await this.api.setSprintStatus(boardId, sprintId, {
              status,
              startedAt:
                status === 'ACTIVE' && ytSprint.start
                  ? new Date(ytSprint.start).toISOString()
                  : undefined,
              closedAt:
                status === 'CLOSED' && ytSprint.finish
                  ? new Date(ytSprint.finish).toISOString()
                  : undefined,
            });
          }
        }
      } catch (err) {
        await this.recordError(checkpoint, 'boards', ytBoard.id, err, projectKey);
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'boards', projectKey, {
      status: this.phaseStatus(checkpoint, 'boards', projectKey),
      completed: sprintsCreated,
      total: sprintsCreated,
    });
    this.reporter.done(
      `Boards [${projectKey}]: ${ytBoards.length} boards, ${sprintsCreated} sprints`,
    );
  }
}
