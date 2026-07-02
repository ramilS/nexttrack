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
import { BoardsExtractor } from '../extractors/boards.extractor';
import { TeamExtractor, mapYtRole } from '../extractors/team.extractor';
import { CustomFieldDefsExtractor } from '../extractors/custom-field-defs.extractor';
import { buildCustomFieldDto, YtFieldDef } from '../transformers/custom-field-def.transformer';
import { mapTagColor } from '../transformers/tag.transformer';
import { mapYtLink } from '../transformers/link.transformer';
import { markdownToTiptap } from '../transformers/markdown-to-tiptap';
import { mapStatesToStatuses } from '../transformers/state.transformer';
import { formatHttpError } from '../utils/http-error';

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
  estimateField?: string;
  dryRun: boolean;
  resume: boolean;
  checkpointFile: string;
  concurrency: number;
  batchSize: number;
  rateLimit: number;
  verbose: boolean;
}

const VERSION = '0.1.0';

// Mirrors the API's ATTACHMENT_MAX_FILE_SIZE (packages/shared): the upload
// endpoint's multer limit hard-caps files at 50 MB and aborts the stream past
// it (surfacing client-side as ECONNRESET, not a clean 413). Pre-skip larger
// files with a clear message so the operator can handle them manually.
const MAX_ATTACHMENT_MB = 50;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

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
  private boardsExtractor!: BoardsExtractor;
  private teamExtractor!: TeamExtractor;
  private fieldDefsExtractor!: CustomFieldDefsExtractor;

  private userTransformer!: UserTransformer;
  private issueTransformer!: IssueTransformer;

  async run(options: MigrateOptions): Promise<void> {
    this.init(options);

    const startTime = Date.now();
    let checkpoint: MigrationCheckpoint;

    if (options.resume) {
      const loaded = await this.checkpointService.load();
      if (!loaded) {
        this.reporter.error('No checkpoint file found. Run without --resume.');
        process.exit(1);
      }
      checkpoint = loaded;
      // Checkpoints written before the tags phase existed lack this key.
      checkpoint.progress.tags ??= {};
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
      await this.ensureFallbackUser(options);

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

      // Step 5: Issue links (non-parent)
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Links');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.links[projectKey]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateLinks(projectKey, checkpoint, options);
      }

      // Step 6: Tags
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Tags');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.tags[projectKey]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateTags(projectKey, checkpoint, options);
      }

      // Step 7: Comments
      step++;
      this.reporter.section(step, totalSteps, 'Migrating Comments');
      for (const projectKey of options.projects) {
        if (checkpoint.progress.comments[projectKey]?.status === 'COMPLETED') {
          continue;
        }
        await this.migrateComments(projectKey, checkpoint, options);
      }

      // Step 8: Attachments
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

      // Step 9: Time Logs
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

      // Step 10: Boards + sprints
      if (options.withBoards) {
        step++;
        this.reporter.section(step, totalSteps, 'Migrating Boards + Sprints');
        for (const projectKey of options.projects) {
          if (checkpoint.progress.boards[projectKey]?.status === 'COMPLETED') {
            continue;
          }
          await this.migrateBoards(projectKey, checkpoint, options);
        }
      }

      await this.checkpointService.markCompleted(checkpoint);
      this.summary.printSummary(checkpoint, startTime);
    } catch (err: any) {
      checkpoint.status = 'INTERRUPTED';
      checkpoint.idMap = this.idMap.serialize();
      await this.checkpointService.save(checkpoint);
      this.reporter.error(`Migration interrupted: ${formatHttpError(err)}`);
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
  // exists in YouTrack. Idempotent by email; survives --resume via the id-map.
  private async ensureFallbackUser(options: MigrateOptions): Promise<void> {
    if (options.dryRun || this.idMap.getFallbackUserId()) return;
    try {
      const result = await this.api.createMigratedUser({
        email: 'migration.ghost@migrated.local',
        name: 'YouTrack Migration',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
        ytId: 'migration-ghost',
      });
      this.idMap.setFallbackUserId(result.data.id);
    } catch (err: any) {
      this.reporter.warn(
        `Could not create the migration ghost user: ${err?.message}. ` +
          `Issues from deleted YouTrack accounts will fail to migrate.`,
      );
    }
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

  private countSteps(options: MigrateOptions): number {
    let steps = 7; // users, projects, issues, parent-links, links, tags, comments
    if (options.withAttachments) steps++;
    if (options.withTimeTracking) steps++;
    if (options.withBoards) steps++;
    return steps;
  }

  private async recordError(
    checkpoint: MigrationCheckpoint,
    phase: string,
    entityId: string,
    err: any,
  ): Promise<void> {
    const message = formatHttpError(err);
    checkpoint.errors.push({
      phase,
      entityId,
      message,
      timestamp: new Date().toISOString(),
    });
    this.reporter.warn(`Error [${phase}] ${entityId}: ${message}`);
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
          await this.recordError(checkpoint, 'users', ytUser.id, err);
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

  // Derive the project's custom-field definitions from YouTrack and create the
  // genuine ones in the target (idempotent by name). Skips first-class fields
  // and bundle fields with no observed values / unsupported types, reporting a
  // one-line summary. Values are mapped later via the registered field map.
  private async createCustomFields(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    let defs: YtFieldDef[];
    try {
      defs = await this.fieldDefsExtractor.collect(projectKey);
    } catch (err) {
      // Non-fatal: without field defs, custom-field VALUES drop, but issues
      // (and their first-class Type/State/Assignee/Priority, read per-issue)
      // still migrate. Record and skip rather than abort the whole run.
      await this.recordError(checkpoint, 'projects', `${projectKey}:field-defs`, err);
      return;
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
        await this.recordError(checkpoint, 'projects', `${projectKey}:field:${def.name}`, err);
      }
    }

    this.reporter.info(
      `Project ${projectKey}: ${created} custom fields provisioned` +
        (skipped.length ? `, skipped ${skipped.join(', ')}` : ''),
    );
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
        await this.recordError(checkpoint, 'projects', projectKey, err);
      }
    }

    // Provision the project's custom fields in the target BEFORE reading the
    // field map below — so YouTrack custom-field values map onto real fields
    // instead of being dropped. First-class fields (Type/State/Assignee/
    // Priority) are excluded; they migrate as native Issue attributes.
    await this.createCustomFields(projectKey, checkpoint, options);

    // Register the target's REAL status and custom-field ids (by name) so issues
    // map to valid ids instead of dropping. Read-only.
    try {
      const statuses = await this.api.getStatusMap(projectKey);
      registerStatusMap(this.idMap, projectKey, statuses);
      const fields = await this.api.getCustomFieldMap(projectKey);
      registerCustomFieldMap(this.idMap, fields);
      this.reporter.info(
        `Project ${projectKey}: registered ${statuses.length} statuses, ${fields.length} custom fields`,
      );
    } catch (err) {
      await this.recordError(checkpoint, 'projects', projectKey, err);
      this.reporter.warn(
        `Project ${projectKey}: could not fetch target status/custom-field maps — ` +
          `is the project created in the target system? Statuses will fall back to ` +
          `the initial status and custom fields will be dropped.`,
      );
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
      this.reporter.log(
        `[DRY] Would add ${members.length} members to ${projectKey}`,
      );
    } else if (members.length > 0) {
      try {
        await this.api.addProjectMembers(projectKey, members);
        this.reporter.info(
          `Project ${projectKey}: ${members.length} users added as members`,
        );
      } catch (err) {
        await this.recordError(checkpoint, 'projects', projectKey, err);
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

    const bar = this.reporter.createCounter(`Issues [${projectKey}]`);
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
          const dto = this.issueTransformer.transform(ytIssue, this.idMap, statusMap, {
            estimateFieldName: options.estimateField,
          });
          const result = await this.api.createMigratedIssue(projectKey, dto);
          this.idMap.registerIssue(ytIssue.id, result.data.id);
          this.idMap.registerIssueByNumber(
            projectKey,
            ytIssue.numberInProject,
            ytIssue.id,
          );
        } catch (err) {
          await this.recordError(checkpoint, 'issues', ytIssue.id, err);
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
            await this.recordError(
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

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        const links = ytIssue.links ?? [];
        if (links.length === 0) continue;

        const sourceId = this.idMap.getIssueId(ytIssue.id);
        if (!sourceId) continue;

        for (const link of links) {
          const type = mapYtLink(link.linkType.name, link.direction);
          if (!type) continue; // unknown type, subtask, or inward-symmetric

          for (const target of link.issues ?? []) {
            const targetId = this.idMap.getIssueId(target.id);
            if (!targetId || targetId === sourceId) continue;

            if (options.dryRun) {
              this.reporter.log(
                `[DRY] Would link ${projectKey}-${ytIssue.numberInProject}: ${type} → ${target.id}`,
              );
              continue;
            }

            try {
              await this.api.createIssueLink(sourceId, { type, targetIssueId: targetId });
              linked++;
            } catch (err) {
              await this.recordError(checkpoint, 'links', ytIssue.id, err);
            }
          }
        }
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'links', projectKey, {
      status: 'COMPLETED',
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

    for await (const batch of this.issuesExtractor.extract(projectKey, {
      withClosedIssues: options.withClosedIssues,
      batchSize: options.batchSize,
    })) {
      for (const ytIssue of batch) {
        const ytTags = ytIssue.tags ?? [];
        if (ytTags.length === 0) continue;

        if (options.dryRun) {
          this.reporter.log(
            `[DRY] Would tag ${projectKey}-${ytIssue.numberInProject}: ` +
              ytTags.map((t) => t.name).join(', '),
          );
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
          await this.recordError(checkpoint, 'tags', ytIssue.id, err);
        }
      }
      checkpoint.idMap = this.idMap.serialize();
      await this.checkpointService.save(checkpoint);
    }

    await this.checkpointService.updateProgress(checkpoint, 'tags', projectKey, {
      status: 'COMPLETED',
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
          await this.recordError(checkpoint, 'comments', ytIssue.id, err);
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
            const authorId =
              this.idMap.getUserId(comment.author.id) ??
              this.idMap.getFallbackUserId();
            if (!authorId) {
              this.reporter.log(
                `Skipping comment — author not found: ${comment.author.id}`,
              );
              continue;
            }

            await this.api.createComment(
              ourIssueId,
              authorId,
              markdownToTiptap(comment.text),
              new Date(comment.created).toISOString(),
            );
            completed++;
          } catch (err) {
            await this.recordError(checkpoint, 'comments', comment.id, err);
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
          await this.recordError(checkpoint, 'attachments', ytIssue.id, err);
          continue;
        }

        // Idempotency: the upload endpoint is not dedup-aware, so on a --resume
        // (or a partial retry) already-uploaded files would duplicate. Read the
        // issue's existing attachments once and skip matches by name+size.
        let existing = new Set<string>();
        if (!options.dryRun && attachments.length > 0) {
          try {
            const rows = await this.api.listAttachments(ourIssueId);
            existing = new Set(rows.map((a) => `${a.filename}:${a.size}`));
          } catch (err) {
            await this.recordError(checkpoint, 'attachments', ytIssue.id, err);
            continue;
          }
        }

        for (const att of attachments) {
          if (options.dryRun) {
            this.reporter.log(`[DRY] Would upload: ${att.name} (${att.size} bytes)`);
            completed++;
            continue;
          }

          if (existing.has(`${att.name}:${att.size}`)) {
            completed++;
            continue;
          }

          // A file over the target's hard cap can never upload — record it as a
          // skip (visible in errors[]) instead of letting it ECONNRESET.
          if ((att.size ?? 0) > MAX_ATTACHMENT_BYTES) {
            const mb = Math.round((att.size ?? 0) / 1024 / 1024);
            await this.recordError(
              checkpoint,
              'attachments',
              `${att.id} "${att.name}"`,
              new Error(`Skipped: ${mb}MB exceeds the ${MAX_ATTACHMENT_MB}MB limit — upload manually`),
            );
            continue;
          }

          try {
            const stream = await this.attachmentsExtractor.downloadStream(att);
            const created = await this.api.uploadAttachmentStream(
              ourIssueId,
              att,
              stream,
            );
            // Backdate to the original YouTrack date + author (the upload path
            // itself stamps now + the migration admin).
            if (created?.id) {
              await this.api.setAttachmentMetadata(created.id, {
                uploadedById:
                  (att.author?.id && this.idMap.getUserId(att.author.id)) ||
                  this.idMap.getFallbackUserId() ||
                  undefined,
                originalCreatedAt: new Date(att.created).toISOString(),
              });
            }
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
            );
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
          await this.recordError(checkpoint, 'timeLogs', ytIssue.id, err);
          continue;
        }

        // Author falls back to the ghost user; entries with no resolvable
        // author (and no ghost) or a non-positive duration are dropped.
        const entries = timeLogs
          .filter((entry) => (entry.duration?.minutes ?? 0) > 0)
          .map((entry) => ({
            userId:
              this.idMap.getUserId(entry.author.id) ??
              this.idMap.getFallbackUserId(),
            minutes: entry.duration.minutes,
            date: new Date(entry.date).toISOString(),
            description: entry.text ?? null,
          }))
          .filter(
            (entry): entry is { userId: string } & typeof entry =>
              entry.userId !== null,
          );

        if (entries.length === 0) continue;

        if (options.dryRun) {
          this.reporter.log(
            `[DRY] Would import ${entries.length} time logs on ${projectKey}-${ytIssue.numberInProject}`,
          );
          completed += entries.length;
          continue;
        }

        try {
          await this.api.createTimeLogs(ourIssueId, entries);
          completed += entries.length;
        } catch (err) {
          await this.recordError(checkpoint, 'timeLogs', ytIssue.id, err);
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

  // Each YouTrack agile board becomes one SCRUM board (so sprints can hold
  // issues). Sprints run after all issues exist, so their membership resolves
  // via the id-map. A board shared across projects is recreated per project —
  // acceptable for the common single-project migration.
  private async migrateBoards(
    projectKey: string,
    checkpoint: MigrationCheckpoint,
    options: MigrateOptions,
  ): Promise<void> {
    await this.checkpointService.updateProgress(checkpoint, 'boards', projectKey, {
      status: 'IN_PROGRESS',
    });

    let sprintsCreated = 0;
    const ytBoards = await this.boardsExtractor.extractForProject(projectKey);

    for (const ytBoard of ytBoards) {
      if (options.dryRun) {
        this.reporter.log(
          `[DRY] Would create board "${ytBoard.name}" with ${ytBoard.sprints?.length ?? 0} sprints`,
        );
        continue;
      }

      try {
        const boardId = await this.api.createBoard(projectKey, {
          name: ytBoard.name,
          type: 'SCRUM',
        });

        for (const ytSprint of ytBoard.sprints ?? []) {
          const sprintId = await this.api.createSprint(boardId, {
            name: ytSprint.name,
            // YouTrack returns goal: null (not absent) → coerce, since the
            // target schema's goal is optional-but-not-nullable.
            goal: ytSprint.goal || undefined,
            startDate: ytSprint.start
              ? new Date(ytSprint.start).toISOString()
              : undefined,
            endDate: ytSprint.finish
              ? new Date(ytSprint.finish).toISOString()
              : undefined,
          });
          sprintsCreated++;

          const issueIds = (ytSprint.issues ?? [])
            .map((issue) => this.idMap.getIssueId(issue.id))
            .filter((id): id is string => id !== null);
          if (issueIds.length > 0) {
            await this.api.addSprintIssues(boardId, sprintId, issueIds);
          }
        }
      } catch (err) {
        await this.recordError(checkpoint, 'boards', ytBoard.id, err);
      }
    }

    await this.checkpointService.updateProgress(checkpoint, 'boards', projectKey, {
      status: 'COMPLETED',
      completed: sprintsCreated,
      total: sprintsCreated,
    });
    this.reporter.done(
      `Boards [${projectKey}]: ${ytBoards.length} boards, ${sprintsCreated} sprints`,
    );
  }
}
