import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaClient, GlobalRole, IssueType, Priority, ActivityType, SprintStatus, BoardType, SwimlaneBy, VersionStatus, TimeLogSource, CustomFieldType, IssueLinkType, AssignStrategy, WorkflowTrigger, WidgetType, NotificationType, InviteStatus, EmailMode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-var-requires -- faker v9 is ESM-only; require() is the only CJS-compatible way to import it
const { faker } = require('@faker-js/faker');
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { ALL_PERMISSIONS, Permission } from '@repo/shared';
import { WEBHOOK_EVENT_TYPES } from '@repo/shared/schemas';
import { generateDefaultWorkflow } from '@/modules/workflows/default-workflow';
import type { WorkflowStatus } from '@repo/shared/schemas';
import { BoardColumn } from '@repo/shared/schemas';

// ─── Configuration ──────────────────────────────────────────────────────────

const SEED = 42;
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Password123!';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@nexttrack.local';
const BCRYPT_ROUNDS = 10;

const COUNTS = {
  users: 20,
  projects: 5,
  issuesPerProject: 50,
  commentsPerIssue: { min: 0, max: 6 },
  tagsPerProject: 8,
  versionsPerProject: 4,
  customFieldsPerProject: 4,
  timeLogsPerProject: 30,
  sprintsPerBoard: 3,
};

// ─── Setup ──────────────────────────────────────────────────────────────────

faker.seed(SEED);

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Data Pools ─────────────────────────────────────────────────────────────

const TAG_PRESETS: { name: string; color: string }[] = [
  { name: 'bug', color: 'red' },
  { name: 'feature', color: 'blue' },
  { name: 'improvement', color: 'violet' },
  { name: 'documentation', color: 'green' },
  { name: 'performance', color: 'orange' },
  { name: 'security', color: 'pink' },
  { name: 'design', color: 'purple' },
  { name: 'testing', color: 'yellow' },
  { name: 'infrastructure', color: 'gray' },
  { name: 'refactor', color: 'orange' },
  { name: 'UX', color: 'pink' },
  { name: 'accessibility', color: 'green' },
];

const PROJECT_TEMPLATES = [
  { key: 'PLAT', name: 'Platform Core', description: 'Core platform services — authentication, billing, API gateway, and shared infrastructure.' },
  { key: 'WEB', name: 'Web Application', description: 'Customer-facing web application built with Next.js. Includes dashboard, settings, and public pages.' },
  { key: 'MOB', name: 'Mobile App', description: 'Cross-platform mobile application for iOS and Android using React Native.' },
  { key: 'DATA', name: 'Data Pipeline', description: 'ETL pipelines, analytics engine, and reporting infrastructure.' },
  { key: 'DEVX', name: 'Developer Experience', description: 'Internal tooling, CI/CD pipelines, documentation, and developer productivity.' },
];

const ISSUE_TEMPLATES: { title: string; type: IssueType; priority: Priority }[] = [
  { title: 'Implement user avatar upload with crop functionality', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Fix login redirect loop when session expires', type: IssueType.BUG, priority: Priority.HIGH },
  { title: 'Add keyboard shortcuts for common actions', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Database query optimization for project listing', type: IssueType.TASK, priority: Priority.HIGH },
  { title: 'Set up error monitoring with Sentry integration', type: IssueType.TASK, priority: Priority.MEDIUM },
  { title: 'Design system: create reusable button variants', type: IssueType.STORY, priority: Priority.MEDIUM },
  { title: 'API rate limiting returns wrong status code', type: IssueType.BUG, priority: Priority.CRITICAL },
  { title: 'Add dark mode support to settings page', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Migrate authentication to OAuth 2.0 PKCE flow', type: IssueType.EPIC, priority: Priority.HIGH },
  { title: 'Fix timezone handling in date picker component', type: IssueType.BUG, priority: Priority.MEDIUM },
  { title: 'Add bulk operations for issue management', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Write integration tests for payment webhooks', type: IssueType.TASK, priority: Priority.HIGH },
  { title: 'Implement real-time notifications via WebSocket', type: IssueType.FEATURE, priority: Priority.HIGH },
  { title: 'Refactor file upload service to support S3 multipart', type: IssueType.TASK, priority: Priority.MEDIUM },
  { title: 'Fix memory leak in WebSocket connection handler', type: IssueType.BUG, priority: Priority.CRITICAL },
  { title: 'Add CSV export for issue reports', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Create onboarding flow for new workspace members', type: IssueType.STORY, priority: Priority.MEDIUM },
  { title: 'Implement full-text search with Elasticsearch', type: IssueType.EPIC, priority: Priority.HIGH },
  { title: 'Fix pagination cursor not resetting after filter change', type: IssueType.BUG, priority: Priority.MEDIUM },
  { title: 'Add drag-and-drop reordering to board columns', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Set up GitHub Actions CI pipeline for monorepo', type: IssueType.TASK, priority: Priority.HIGH },
  { title: 'Audit and fix all accessibility violations (WCAG 2.1)', type: IssueType.EPIC, priority: Priority.MEDIUM },
  { title: 'Implement comment threading and reactions', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Fix race condition in optimistic UI updates', type: IssueType.BUG, priority: Priority.HIGH },
  { title: 'Add project archiving with data retention policy', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Performance: lazy load heavy dashboard widgets', type: IssueType.TASK, priority: Priority.MEDIUM },
  { title: 'Implement role-based access control for custom fields', type: IssueType.FEATURE, priority: Priority.HIGH },
  { title: 'Fix email templates rendering incorrectly in Outlook', type: IssueType.BUG, priority: Priority.LOW },
  { title: 'Add Slack integration for issue notifications', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Database migration strategy for zero-downtime deploys', type: IssueType.TASK, priority: Priority.HIGH },
  { title: 'Investigate flaky E2E test suite on CI', type: IssueType.BUG, priority: Priority.MEDIUM },
  { title: 'Add 2FA support via TOTP', type: IssueType.FEATURE, priority: Priority.HIGH },
  { title: 'Refactor settings page into modular sections', type: IssueType.TASK, priority: Priority.LOW },
  { title: 'Cache invalidation breaks after concurrent updates', type: IssueType.BUG, priority: Priority.HIGH },
  { title: 'Implement project templates for faster onboarding', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Audit log: persist all destructive operations', type: IssueType.EPIC, priority: Priority.HIGH },
  { title: 'Image uploads silently fail for files > 10MB', type: IssueType.BUG, priority: Priority.HIGH },
  { title: 'Add saved filter views for issue lists', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Documentation: write architecture decision records', type: IssueType.TASK, priority: Priority.LOW },
  { title: 'Improve cold-start time of API container', type: IssueType.TASK, priority: Priority.MEDIUM },
  { title: 'Search returns stale results after deletion', type: IssueType.BUG, priority: Priority.MEDIUM },
  { title: 'Add inline issue creation from board column', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Refactor email service to use templating engine', type: IssueType.TASK, priority: Priority.LOW },
  { title: 'Sprint velocity chart shows wrong burndown', type: IssueType.BUG, priority: Priority.HIGH },
  { title: 'Implement workspace-level analytics dashboard', type: IssueType.EPIC, priority: Priority.MEDIUM },
  { title: 'Allow users to set custom avatar from Gravatar', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Migrate logger from winston to pino for performance', type: IssueType.TASK, priority: Priority.MEDIUM },
  { title: 'Mobile: swipe gestures on issue cards', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Permissions panel: search and bulk-assign roles', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Fix incorrect timezone in audit log timestamps', type: IssueType.BUG, priority: Priority.MEDIUM },
  { title: 'Add support for Markdown shortcuts in editor', type: IssueType.FEATURE, priority: Priority.LOW },
  { title: 'Enable structured logging with trace IDs', type: IssueType.TASK, priority: Priority.HIGH },
  { title: 'Issue export to PDF for compliance reports', type: IssueType.FEATURE, priority: Priority.MEDIUM },
  { title: 'Optimize background job concurrency limits', type: IssueType.TASK, priority: Priority.MEDIUM },
];

const COMMENT_BODIES = [
  'Looks good to me. Let\'s ship it.',
  'I think we should consider the edge case where the user has no permissions. Could we add a check before the API call?',
  'Nice work! One small thing — could we extract this into a shared utility? I\'ve seen this pattern in a few places.',
  'This is blocked by the auth refactor. Moving to next sprint.',
  'I tested this locally and it works great. The fix also resolved a related issue with the mobile view.',
  'Can we add a loading state here? Right now the UI just freezes while the request is pending.',
  'Updated the design mockups based on feedback from the product review. New link attached.',
  'I ran the benchmark and we\'re seeing a 3x improvement in query time. Great optimization!',
  'We need to coordinate with the backend team before merging this. The API contract changed.',
  'Added unit tests covering the main scenarios. Code coverage went from 72% to 89%.',
  'Moved this to "In Review" — PR is up and ready for feedback.',
  'The original approach won\'t scale past 10k records. I rewrote it using cursor-based pagination.',
  'Fixed the typo in the error message. Also cleaned up some unused imports while I was there.',
  'Discussed with the team in standup — we\'re going to split this into two smaller issues.',
  'Deployed to staging. Could someone verify the fix on the staging environment?',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[faker.number.int({ min: 0, max: arr.length - 1 })]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  return faker.helpers.arrayElements(arr, n);
}

function richText(text: string): object {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function daysAgo(days: number): Date {
  return faker.date.recent({ days, refDate: new Date() });
}

// ─── System Roles ────────────────────────────────────────────────────────────

const SYSTEM_ROLES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Project Admin', description: 'Full access to all project features and settings', permissions: ALL_PERMISSIONS },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Developer', description: 'Can create and update issues, comments, articles, and log time', permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE, Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN, Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE, Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN] },
  { id: '00000000-0000-0000-0000-000000000003', name: 'QA', description: 'Same as Developer plus can delete issues', permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE, Permission.ISSUE_DELETE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE, Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN, Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE, Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN] },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Reporter', description: 'Can create issues and comments, read articles, and log own time', permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN, Permission.ARTICLE_READ, Permission.TIME_LOG_OWN] },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Observer', description: 'Read-only access to issues and articles', permissions: [Permission.ISSUE_READ, Permission.ARTICLE_READ] },
];

async function seedSystemRoles() {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { permissions: role.permissions as any },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions as any,
        isSystem: true,
      },
    });
  }
  console.log(`  ${SYSTEM_ROLES.length} system roles ready`);
}

// ─── Seeders ────────────────────────────────────────────────────────────────

async function seedUsers(): Promise<string[]> {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  let admin = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Alex Morgan',
        passwordHash,
        hasPassword: true,
        role: GlobalRole.ADMIN,
      },
    });
    console.log(`  Admin created: ${ADMIN_EMAIL} / ${PASSWORD}`);
  }

  const userIds = [admin.id];

  const teamMembers = [
    { name: 'Jordan Rivera', email: 'jordan.rivera@company.dev' },
    { name: 'Sam Chen', email: 'sam.chen@company.dev' },
    { name: 'Taylor Brooks', email: 'taylor.brooks@company.dev' },
    { name: 'Casey Williams', email: 'casey.williams@company.dev' },
    { name: 'Morgan Lee', email: 'morgan.lee@company.dev' },
    { name: 'Riley Patel', email: 'riley.patel@company.dev' },
    { name: 'Quinn Johnson', email: 'quinn.johnson@company.dev' },
    { name: 'Avery Kim', email: 'avery.kim@company.dev' },
    { name: 'Drew Martinez', email: 'drew.martinez@company.dev' },
    { name: 'Jamie Thompson', email: 'jamie.thompson@company.dev' },
    { name: 'Blake Turner', email: 'blake.turner@company.dev' },
    { name: 'Hayden Cooper', email: 'hayden.cooper@company.dev' },
    { name: 'Skyler Nguyen', email: 'skyler.nguyen@company.dev' },
    { name: 'Reese Singh', email: 'reese.singh@company.dev' },
    { name: 'Rowan Davis', email: 'rowan.davis@company.dev' },
    { name: 'Logan Park', email: 'logan.park@company.dev' },
    { name: 'Emerson Walker', email: 'emerson.walker@company.dev' },
    { name: 'Phoenix Reed', email: 'phoenix.reed@company.dev' },
    { name: 'Sage Bennett', email: 'sage.bennett@company.dev' },
  ];

  for (const member of teamMembers) {
    const existing = await prisma.user.findFirst({ where: { email: member.email } });
    if (existing) {
      userIds.push(existing.id);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email: member.email,
        name: member.name,
        passwordHash,
        hasPassword: true,
        role: GlobalRole.USER,
      },
    });
    userIds.push(user.id);
  }

  console.log(`  ${userIds.length} users ready`);
  return userIds;
}

interface ProjectData {
  projectId: string;
  workflowStatuses: WorkflowStatus[];
  tagIds: string[];
  versionIds: string[];
  customFieldIds: string[];
  boardId: string;
  sprintIds: string[];
  memberIds: string[];
}

const SWIMLANE_ROTATION: SwimlaneBy[] = [
  SwimlaneBy.PRIORITY,
  SwimlaneBy.ASSIGNEE,
  SwimlaneBy.TYPE,
  SwimlaneBy.EPIC,
  SwimlaneBy.NONE,
];

async function seedProject(
  template: typeof PROJECT_TEMPLATES[number],
  allUserIds: string[],
  adminId: string,
  projectIndex: number,
): Promise<ProjectData> {
  const existing = await prisma.project.findFirst({ where: { key: template.key } });
  if (existing) {
    console.log(`  Project ${template.key} already exists, skipping`);
    const workflow = await prisma.workflow.findFirst({
      where: { projectId: existing.id, isDefault: true },
      include: { statuses: { orderBy: { ordinal: 'asc' } } },
    });
    const tags = await prisma.tag.findMany({ where: { projectId: existing.id } });
    const versions = await prisma.projectVersion.findMany({ where: { projectId: existing.id } });
    const fields = await prisma.customField.findMany({ where: { projectId: existing.id } });
    const board = await prisma.agileBoard.findFirst({ where: { projectId: existing.id } });
    const sprints = board ? await prisma.sprint.findMany({ where: { boardId: board.id } }) : [];
    const members = await prisma.projectMember.findMany({ where: { projectId: existing.id } });

    return {
      projectId: existing.id,
      workflowStatuses: workflow ? workflow.statuses : [],
      tagIds: tags.map((t) => t.id),
      versionIds: versions.map((v) => v.id),
      customFieldIds: fields.map((f) => f.id),
      boardId: board?.id ?? '',
      sprintIds: sprints.map((s) => s.id),
      memberIds: members.map((m) => m.userId),
    };
  }

  const project = await prisma.project.create({
    data: {
      key: template.key,
      name: template.name,
      description: template.description,
      createdById: adminId,
    },
  });

  await prisma.projectIssueCounter.create({
    data: { projectId: project.id, lastNumber: 0 },
  });

  // Members — admin as Project Admin, random subset as Developer/Observer
  const ROLE_PROJECT_ADMIN = '00000000-0000-0000-0000-000000000001';
  const ROLE_DEVELOPER = '00000000-0000-0000-0000-000000000002';
  const ROLE_OBSERVER = '00000000-0000-0000-0000-000000000005';

  const memberCount = faker.number.int({ min: 4, max: Math.min(8, allUserIds.length) });
  const otherUserIds = allUserIds.filter((id) => id !== adminId);
  const selectedMembers = pickN(otherUserIds, memberCount - 1);
  const memberIds = [adminId, ...selectedMembers];

  await prisma.projectMember.create({
    data: { userId: adminId, projectId: project.id, roleId: ROLE_PROJECT_ADMIN },
  });
  for (const userId of selectedMembers) {
    const roleId = faker.helpers.weightedArrayElement([
      { value: ROLE_DEVELOPER, weight: 7 },
      { value: ROLE_OBSERVER, weight: 3 },
    ]);
    await prisma.projectMember.create({
      data: { userId, projectId: project.id, roleId },
    });
  }

  // Workflow (statuses nested; transitions after, since they reference status ids)
  const wfData = generateDefaultWorkflow();
  const workflow = await prisma.workflow.create({
    data: {
      projectId: project.id,
      name: wfData.name,
      isDefault: wfData.isDefault,
      statuses: {
        create: wfData.statuses.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          category: s.category,
          isInitial: s.isInitial,
          isResolved: s.isResolved,
          ordinal: s.ordinal,
        })),
      },
    },
  });
  await prisma.workflowTransition.createMany({
    data: wfData.transitions.map((t) => ({
      id: t.id,
      workflowId: workflow.id,
      name: t.name,
      fromStatusId: t.fromStatusId === '*' ? null : t.fromStatusId,
      toStatusId: t.toStatusId,
      requiredRole: t.requiredRole,
    })),
  });
  const statuses = wfData.statuses;

  // Tags
  const projectTags = pickN(TAG_PRESETS, COUNTS.tagsPerProject);
  const tags = await Promise.all(
    projectTags.map((t) =>
      prisma.tag.create({ data: { projectId: project.id, name: t.name, color: t.color } }),
    ),
  );

  // Versions
  const versionNames = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
  const versionStatuses = [VersionStatus.RELEASED, VersionStatus.RELEASED, VersionStatus.UNRELEASED, VersionStatus.UNRELEASED];
  const versions = await Promise.all(
    versionNames.slice(0, COUNTS.versionsPerProject).map((name, i) =>
      prisma.projectVersion.create({
        data: {
          projectId: project.id,
          name,
          status: versionStatuses[i]!,
          releaseDate: versionStatuses[i] === VersionStatus.RELEASED ? daysAgo(30 * (COUNTS.versionsPerProject - i)) : null,
          ordinal: i,
        },
      }),
    ),
  );

  // Custom fields
  const buildEnumOptions = (names: string[]) =>
    names.map((name, i) => ({ id: faker.string.uuid(), name, color: null, ordinal: i }));

  const fieldDefs = [
    { name: 'Environment', type: CustomFieldType.ENUM, config: { type: 'ENUM', options: buildEnumOptions(['Production', 'Staging', 'Development', 'Local']) } },
    { name: 'Story Points', type: CustomFieldType.NUMBER, config: { type: 'NUMBER', min: 1, max: 21 } },
    { name: 'Due Date', type: CustomFieldType.DATE, config: { type: 'DATE' } },
    { name: 'Browser', type: CustomFieldType.ENUM, config: { type: 'ENUM', options: buildEnumOptions(['Chrome', 'Firefox', 'Safari', 'Edge']) } },
    { name: 'Release Notes', type: CustomFieldType.TEXT, config: { type: 'TEXT', maxLength: 500 } },
  ];

  const selectedFields = fieldDefs.slice(0, COUNTS.customFieldsPerProject);
  const customFields = await Promise.all(
    selectedFields.map((f, i) =>
      prisma.customField.create({
        data: {
          projectId: project.id,
          name: f.name,
          type: f.type,
          ordinal: i,
          config: f.config as any,
        },
      }),
    ),
  );

  // Board
  const boardColumns = buildDefaultColumns(statuses);
  const board = await prisma.agileBoard.create({
    data: {
      projectId: project.id,
      name: `${template.name} Board`,
      type: BoardType.SCRUM,
      columns: boardColumns as any,
      swimlaneBy: SWIMLANE_ROTATION[projectIndex % SWIMLANE_ROTATION.length],
      isDefault: true,
      createdById: adminId,
    },
  });

  // Sprints
  const now = new Date();
  const sprintDefs = [
    { name: 'Sprint 1', status: SprintStatus.CLOSED, startOffset: -28, endOffset: -14 },
    { name: 'Sprint 2', status: SprintStatus.ACTIVE, startOffset: -14, endOffset: 0 },
    { name: 'Sprint 3', status: SprintStatus.PLANNING, startOffset: 0, endOffset: 14 },
  ];

  const sprints = await Promise.all(
    sprintDefs.slice(0, COUNTS.sprintsPerBoard).map((s, i) => {
      const startDate = new Date(now.getTime() + s.startOffset * 86400000);
      const endDate = new Date(now.getTime() + s.endOffset * 86400000);
      return prisma.sprint.create({
        data: {
          boardId: board.id,
          name: s.name,
          goal: faker.company.catchPhrase(),
          status: s.status,
          startDate,
          endDate,
          startedAt: s.status !== SprintStatus.PLANNING ? startDate : null,
          closedAt: s.status === SprintStatus.CLOSED ? endDate : null,
          ordinal: i,
        },
      });
    }),
  );

  console.log(`  Project ${template.key}: ${memberIds.length} members, ${tags.length} tags, ${sprints.length} sprints`);

  return {
    projectId: project.id,
    workflowStatuses: statuses,
    tagIds: tags.map((t) => t.id),
    versionIds: versions.map((v) => v.id),
    customFieldIds: customFields.map((f) => f.id),
    boardId: board.id,
    sprintIds: sprints.map((s) => s.id),
    memberIds,
  };
}

async function seedIssues(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, workflowStatuses, tagIds, sprintIds, memberIds } = projectData;

  const existingCount = await prisma.issue.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: ${existingCount} issues already exist, skipping`);
    return;
  }

  const shuffledTemplates = faker.helpers.shuffle([...ISSUE_TEMPLATES]);
  const issueTemplates = shuffledTemplates.slice(0, COUNTS.issuesPerProject);

  const initialStatus = workflowStatuses.find((s) => s.isInitial)!;
  const statusWeights = workflowStatuses.map((s) => ({
    value: s,
    weight: s.isInitial ? 2 : s.category === 'STARTED' ? 4 : s.category === 'DONE' ? 3 : 1,
  }));

  const issuesData: any[] = [];
  const tagLinks: { issueId: string; tagId: string }[] = [];
  const watchers: { issueId: string; userId: string }[] = [];
  const activities: any[] = [];
  const comments: any[] = [];
  const parentCandidates: { id: string; title: string; priority: Priority; reporterId: string }[] = [];

  let issueNumber = 0;

  for (const template of issueTemplates) {
    issueNumber++;
    const issueId = randomUUID();
    const reporter = pick(memberIds);
    const assignee = faker.datatype.boolean(0.8) ? pick(memberIds) : null;
    const status = faker.helpers.weightedArrayElement(statusWeights);
    const createdAt = daysAgo(60);
    const isResolved = status.isResolved;
    const sprint = sprintIds.length > 0 && faker.datatype.boolean(0.6) ? pick(sprintIds) : null;

    issuesData.push({
      id: issueId,
      number: issueNumber,
      title: template.title,
      description: richText(faker.lorem.paragraphs({ min: 1, max: 3 })),
      type: template.type,
      priority: template.priority,
      statusId: status.id,
      projectId,
      reporterId: reporter,
      assigneeId: assignee,
      sprintId: sprint,
      estimate: faker.datatype.boolean(0.6) ? pick([1, 2, 3, 5, 8, 13]) : null,
      startDate: faker.datatype.boolean(0.4) ? faker.date.recent({ days: 14 }) : null,
      dueDate: faker.datatype.boolean(0.3) ? faker.date.soon({ days: 30 }) : null,
      resolvedAt: isResolved ? daysAgo(7) : null,
      createdAt,
    });

    if ([IssueType.STORY, IssueType.EPIC, IssueType.FEATURE].includes(template.type)) {
      parentCandidates.push({ id: issueId, title: template.title, priority: template.priority, reporterId: reporter });
    }

    // Tags (0–3 per issue)
    const issueTags = pickN(tagIds, faker.number.int({ min: 0, max: Math.min(3, tagIds.length) }));
    for (const tagId of issueTags) {
      tagLinks.push({ issueId, tagId });
    }

    // Watchers (reporter + maybe assignee)
    watchers.push({ issueId, userId: reporter });
    if (assignee && assignee !== reporter) {
      watchers.push({ issueId, userId: assignee });
    }

    // Activity: ISSUE_CREATED
    activities.push({
      issueId,
      actorId: reporter,
      type: ActivityType.ISSUE_CREATED,
      payload: {},
      createdAt,
    });

    if (status.id !== initialStatus.id) {
      activities.push({
        issueId,
        actorId: assignee ?? reporter,
        type: ActivityType.STATUS_CHANGE,
        payload: { from: initialStatus.name, to: status.name },
        createdAt: daysAgo(30),
      });
    }

    const commentCount = faker.number.int(COUNTS.commentsPerIssue);
    for (let c = 0; c < commentCount; c++) {
      const commentAuthor = pick(memberIds);
      const commentDate = faker.date.between({ from: createdAt, to: new Date() });
      comments.push({
        issueId,
        authorId: commentAuthor,
        body: richText(pick(COMMENT_BODIES)),
        createdAt: commentDate,
      });
      activities.push({
        issueId,
        actorId: commentAuthor,
        type: ActivityType.COMMENT_ADD,
        payload: {},
        createdAt: commentDate,
      });
    }
  }

  // Subtasks: pick ~4 candidate parents and add 2-3 children each
  const parentSlice = parentCandidates.slice(0, 4);
  for (const parent of parentSlice) {
    const childCount = faker.number.int({ min: 2, max: 3 });
    for (let c = 0; c < childCount; c++) {
      issueNumber++;
      const childId = randomUUID();
      const assignee = faker.datatype.boolean(0.7) ? pick(memberIds) : null;
      const status = faker.helpers.weightedArrayElement(statusWeights);

      issuesData.push({
        id: childId,
        number: issueNumber,
        title: `${parent.title} — subtask ${c + 1}`,
        description: richText(faker.lorem.sentence()),
        type: IssueType.TASK,
        priority: parent.priority,
        statusId: status.id,
        projectId,
        reporterId: parent.reporterId,
        assigneeId: assignee,
        parentId: parent.id,
        estimate: faker.datatype.boolean(0.5) ? pick([1, 2, 3, 5]) : null,
        createdAt: daysAgo(30),
      });
    }
  }

  await prisma.issue.createMany({ data: issuesData });
  if (tagLinks.length > 0) await prisma.issueTag.createMany({ data: tagLinks, skipDuplicates: true });
  if (watchers.length > 0) await prisma.issueWatcher.createMany({ data: watchers, skipDuplicates: true });
  if (activities.length > 0) await prisma.activity.createMany({ data: activities });
  if (comments.length > 0) await prisma.comment.createMany({ data: comments });

  await prisma.projectIssueCounter.update({
    where: { projectId },
    data: { lastNumber: issueNumber },
  });

  // Update sprint issue counts
  for (const sprintId of sprintIds) {
    const total = await prisma.issue.count({ where: { sprintId, deletedAt: null } });
    const doneStatusIds = workflowStatuses.filter((s) => s.isResolved).map((s) => s.id);
    const completed = await prisma.issue.count({
      where: { sprintId, statusId: { in: doneStatusIds }, deletedAt: null },
    });
    await prisma.sprint.update({
      where: { id: sprintId },
      data: { totalIssues: total, completedIssues: completed },
    });
  }

  console.log(`  ${templateKey}: ${issueNumber} issues with comments & activities`);
}

async function seedTimeLogs(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, memberIds } = projectData;

  const existingCount = await prisma.timeLog.count({
    where: { issue: { projectId } },
  });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: time logs already exist, skipping`);
    return;
  }

  const issues = await prisma.issue.findMany({
    where: { projectId, deletedAt: null, assigneeId: { not: null } },
    select: { id: true, assigneeId: true },
    take: 15,
  });

  const logs: any[] = [];
  for (const issue of issues) {
    if (logs.length >= COUNTS.timeLogsPerProject) break;
    if (!faker.datatype.boolean(0.5)) continue;

    const logsForIssue = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < logsForIssue && logs.length < COUNTS.timeLogsPerProject; i++) {
      logs.push({
        issueId: issue.id,
        userId: issue.assigneeId!,
        duration: pick([15, 30, 45, 60, 90, 120, 180, 240]),
        date: daysAgo(14),
        description: faker.datatype.boolean(0.6) ? faker.hacker.phrase() : null,
        source: faker.helpers.weightedArrayElement([
          { value: TimeLogSource.MANUAL, weight: 6 },
          { value: TimeLogSource.TIMER, weight: 4 },
        ]),
      });
    }
  }

  if (logs.length > 0) {
    await prisma.timeLog.createMany({ data: logs });
  }
  const count = logs.length;

  // Update spent on issues
  const timeLogs = await prisma.timeLog.groupBy({
    by: ['issueId'],
    _sum: { duration: true },
    where: { issue: { projectId }, deletedAt: null },
  });
  for (const log of timeLogs) {
    await prisma.issue.update({
      where: { id: log.issueId },
      data: { spent: log._sum.duration ?? 0 },
    });
  }

  console.log(`  ${templateKey}: ${count} time logs`);
}

// ─── Board Column Builder ───────────────────────────────────────────────────

function buildDefaultColumns(statuses: WorkflowStatus[]): BoardColumn[] {
  const unstarted = statuses.filter((s) => s.category === 'UNSTARTED');
  const started = statuses.filter((s) => s.category === 'STARTED');
  const done = statuses.filter((s) => s.category === 'DONE');

  const columns: BoardColumn[] = [];

  if (unstarted.length > 0) {
    columns.push({
      id: randomUUID(),
      name: 'To Do',
      statusIds: unstarted.map((s) => s.id),
      color: '#6b7280',
      ordinal: 0,
    });
  }

  for (const status of started) {
    columns.push({
      id: randomUUID(),
      name: status.name,
      statusIds: [status.id],
      color: status.color,
      ordinal: columns.length,
    });
  }

  if (done.length > 0) {
    columns.push({
      id: randomUUID(),
      name: 'Done',
      statusIds: done.map((s) => s.id),
      color: '#22c55e',
      ordinal: columns.length,
    });
  }

  return columns;
}

// ─── Issue Links ─────────────────────────────────────────────────────────────

async function seedIssueLinks(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, memberIds } = projectData;

  const existingCount = await prisma.issueLink.count({
    where: { sourceIssue: { projectId } },
  });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: issue links already exist, skipping`);
    return;
  }

  const issues = await prisma.issue.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true },
    take: 20,
  });

  if (issues.length < 4) return;

  const linkDefs: { type: IssueLinkType; srcIdx: number; tgtIdx: number }[] = [
    { type: IssueLinkType.DEPENDS_ON, srcIdx: 2, tgtIdx: 0 },
    { type: IssueLinkType.DEPENDS_ON, srcIdx: 3, tgtIdx: 1 },
    { type: IssueLinkType.BLOCKS, srcIdx: 0, tgtIdx: 4 },
    { type: IssueLinkType.DUPLICATES, srcIdx: 5, tgtIdx: 6 },
    { type: IssueLinkType.RELATES_TO, srcIdx: 1, tgtIdx: 3 },
    { type: IssueLinkType.RELATES_TO, srcIdx: 4, tgtIdx: 7 },
    { type: IssueLinkType.IS_CLONED_FROM, srcIdx: 8, tgtIdx: 0 },
    { type: IssueLinkType.DEPENDS_ON, srcIdx: 9, tgtIdx: 2 },
    { type: IssueLinkType.BLOCKS, srcIdx: 1, tgtIdx: 10 },
    { type: IssueLinkType.RELATES_TO, srcIdx: 6, tgtIdx: 11 },
    { type: IssueLinkType.DUPLICATES, srcIdx: 12, tgtIdx: 5 },
    { type: IssueLinkType.DEPENDS_ON, srcIdx: 7, tgtIdx: 3 },
    { type: IssueLinkType.RELATES_TO, srcIdx: 10, tgtIdx: 13 },
    { type: IssueLinkType.BLOCKS, srcIdx: 2, tgtIdx: 14 },
    { type: IssueLinkType.IS_CLONED_FROM, srcIdx: 15, tgtIdx: 1 },
  ];

  let count = 0;
  for (const def of linkDefs) {
    if (def.srcIdx >= issues.length || def.tgtIdx >= issues.length) continue;
    try {
      await prisma.issueLink.create({
        data: {
          type: def.type,
          sourceIssueId: issues[def.srcIdx]!.id,
          targetIssueId: issues[def.tgtIdx]!.id,
          createdById: pick(memberIds),
        },
      });
      count++;
    } catch {
      // skip duplicates
    }
  }

  console.log(`  ${templateKey}: ${count} issue links`);
}

// ─── Teams ───────────────────────────────────────────────────────────────────

async function seedTeams(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, memberIds } = projectData;

  const existingCount = await prisma.team.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: teams already exist, skipping`);
    return;
  }

  const teamDefs = [
    { name: 'Frontend', description: 'UI and client-side development' },
    { name: 'Backend', description: 'API and server-side services' },
    { name: 'QA', description: 'Quality assurance and testing' },
  ];

  for (const def of teamDefs) {
    if (memberIds.length < 3) break;

    const teamMembers = pickN(memberIds.slice(1), faker.number.int({ min: 2, max: Math.min(4, memberIds.length - 1) }));
    const leadId = teamMembers[0]!;

    const team = await prisma.team.create({
      data: {
        projectId,
        name: def.name,
        description: def.description,
        leadId,
      },
    });

    for (const userId of teamMembers) {
      await prisma.teamMember.create({
        data: { teamId: team.id, userId },
      });
    }
  }

  console.log(`  ${templateKey}: ${teamDefs.length} teams`);
}

// ─── Auto-assign Rules ───────────────────────────────────────────────────────

async function seedAutoAssignRules(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, memberIds } = projectData;

  const existingCount = await prisma.autoAssignRule.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: auto-assign rules already exist, skipping`);
    return;
  }

  const teams = await prisma.team.findMany({ where: { projectId }, take: 2 });

  const rules: { name: string; conditions: any; strategy: AssignStrategy; teamId?: string; assigneeId?: string }[] = [
    {
      name: 'Critical bugs → Project Lead',
      conditions: { and: [
        { field: 'type', op: 'in', values: [IssueType.BUG] },
        { field: 'priority', op: 'gte', value: Priority.CRITICAL },
      ] },
      strategy: AssignStrategy.PROJECT_LEAD,
    },
  ];

  if (teams.length > 0) {
    rules.push({
      name: 'Feature requests → Frontend team (round robin)',
      conditions: { field: 'type', op: 'in', values: [IssueType.FEATURE] },
      strategy: AssignStrategy.ROUND_ROBIN_TEAM,
      teamId: teams[0]!.id,
    });
  }

  if (memberIds.length > 2) {
    rules.push({
      name: 'Tasks → Specific developer',
      conditions: { field: 'type', op: 'in', values: [IssueType.TASK] },
      strategy: AssignStrategy.SPECIFIC_USER,
      assigneeId: memberIds[1],
    });
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    await prisma.autoAssignRule.create({
      data: {
        projectId,
        name: rule.name,
        conditions: rule.conditions as any,
        strategy: rule.strategy,
        teamId: rule.teamId,
        assigneeId: rule.assigneeId,
        priority: i,
      },
    });
  }

  console.log(`  ${templateKey}: ${rules.length} auto-assign rules`);
}

// ─── Dashboards ──────────────────────────────────────────────────────────────

async function seedDashboards(adminId: string): Promise<void> {
  const existingCount = await prisma.dashboard.count({ where: { userId: adminId } });
  if (existingCount > 0) {
    console.log('  Dashboards already exist, skipping');
    return;
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      userId: adminId,
      name: 'My Dashboard',
      isDefault: true,
      layout: [
        { widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 },
        { widgetId: 'w2', x: 6, y: 0, w: 6, h: 4 },
        { widgetId: 'w3', x: 0, y: 4, w: 4, h: 3 },
        { widgetId: 'w4', x: 4, y: 4, w: 4, h: 3 },
        { widgetId: 'w5', x: 8, y: 4, w: 4, h: 3 },
      ] as any,
    },
  });

  const widgets: { id: string; type: WidgetType; title: string; config: any }[] = [
    { id: 'w1', type: WidgetType.MY_ISSUES, title: 'My Issues', config: { limit: 10 } },
    { id: 'w2', type: WidgetType.RECENT_ACTIVITY, title: 'Recent Activity', config: { limit: 15 } },
    { id: 'w3', type: WidgetType.ISSUES_BY_STATUS, title: 'Issues by Status', config: {} },
    { id: 'w4', type: WidgetType.ISSUES_BY_PRIORITY, title: 'Issues by Priority', config: {} },
    { id: 'w5', type: WidgetType.OVERDUE_ISSUES, title: 'Overdue Issues', config: { limit: 5 } },
  ];

  for (const w of widgets) {
    await prisma.dashboardWidget.create({
      data: {
        dashboardId: dashboard.id,
        type: w.type,
        title: w.title,
        config: w.config as any,
      },
    });
  }

  console.log('  1 dashboard with 5 widgets');
}

// ─── Knowledge Base Articles ─────────────────────────────────────────────────

async function seedArticles(projectData: ProjectData, templateKey: string, adminId: string): Promise<void> {
  const { projectId } = projectData;

  const existingCount = await prisma.article.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: articles already exist, skipping`);
    return;
  }

  const articles = [
    { title: 'Getting Started', slug: 'getting-started', content: 'Welcome to the project! This guide will help you set up your development environment and make your first contribution.' },
    { title: 'Architecture Overview', slug: 'architecture-overview', content: 'This document describes the high-level architecture of the system, including the main services, data flows, and deployment topology.' },
    { title: 'API Reference', slug: 'api-reference', content: 'Complete API reference for all endpoints. Each section includes request/response schemas, authentication requirements, and usage examples.' },
    { title: 'Contributing Guide', slug: 'contributing-guide', content: 'Guidelines for contributing to the project. Covers code style, PR process, testing requirements, and commit message conventions.' },
    { title: 'Deployment Guide', slug: 'deployment-guide', content: 'Step-by-step instructions for deploying to staging and production environments. Includes rollback procedures and health check endpoints.' },
  ];

  const childArticles = [
    { title: 'Installation', slug: 'installation', parentSlug: 'getting-started', content: 'Prerequisites and installation steps for all supported platforms.' },
    { title: 'Quick Start Tutorial', slug: 'quick-start-tutorial', parentSlug: 'getting-started', content: 'A 5-minute tutorial to get up and running with the basics.' },
    { title: 'REST Endpoints', slug: 'rest-endpoints', parentSlug: 'api-reference', content: 'All REST API endpoints with method, path, parameters, and response formats.' },
    { title: 'WebSocket Events', slug: 'websocket-events', parentSlug: 'api-reference', content: 'Real-time event types, payload schemas, and connection lifecycle.' },
  ];

  const createdArticles = new Map<string, string>();

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i]!;
    const article = await prisma.article.create({
      data: {
        projectId,
        title: a.title,
        slug: a.slug,
        content: richText(a.content) as any,
        sortOrder: i,
        createdById: adminId,
        publishedAt: i < 3 ? daysAgo(14) : null,
      },
    });
    createdArticles.set(a.slug, article.id);
  }

  for (let i = 0; i < childArticles.length; i++) {
    const c = childArticles[i]!;
    const parentId = createdArticles.get(c.parentSlug);
    await prisma.article.create({
      data: {
        projectId,
        parentId,
        title: c.title,
        slug: c.slug,
        content: richText(c.content) as any,
        sortOrder: i,
        createdById: adminId,
        publishedAt: daysAgo(7),
      },
    });
  }

  // Add a few comments
  const firstArticleId = createdArticles.get('getting-started');
  if (firstArticleId) {
    for (let i = 0; i < 3; i++) {
      await prisma.articleComment.create({
        data: {
          articleId: firstArticleId,
          authorId: pick(projectData.memberIds),
          body: richText(pick(COMMENT_BODIES)) as any,
        },
      });
    }
  }

  console.log(`  ${templateKey}: ${articles.length + childArticles.length} articles`);
}

// ─── Workflow Rules ──────────────────────────────────────────────────────────

async function seedWorkflowRules(projectData: ProjectData, templateKey: string, adminId: string): Promise<void> {
  const { projectId } = projectData;

  const existingCount = await prisma.workflowRule.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: workflow rules already exist, skipping`);
    return;
  }

  const workflow = await prisma.workflow.findFirst({
    where: { projectId, isDefault: true },
    include: { statuses: { orderBy: { ordinal: 'asc' } } },
  });
  if (!workflow) return;

  const statuses = workflow.statuses;
  const doneStatus = statuses.find((s) => s.category === 'DONE');
  const inProgressStatus = statuses.find((s) => s.category === 'STARTED');

  const rules = [
    {
      name: 'Auto-set priority for critical bugs',
      trigger: WorkflowTrigger.ON_CREATE,
      conditions: {
        and: [
          { field: 'type', op: 'in', values: [IssueType.BUG] },
          { field: 'priority', op: 'gte', value: Priority.HIGH },
        ],
      },
      actions: [
        { type: 'SET_DUE_DATE', offsetDays: 3 },
      ],
    },
    {
      name: 'Add comment on status change to Done',
      trigger: WorkflowTrigger.ON_STATUS_CHANGE,
      conditions: doneStatus
        ? { field: 'newStatus', op: 'eq', value: doneStatus.id }
        : {},
      actions: [
        { type: 'ADD_COMMENT', body: 'Issue has been resolved and moved to Done.' },
      ],
    },
    {
      name: 'Block close without assignee',
      trigger: WorkflowTrigger.ON_STATUS_CHANGE,
      conditions: {
        and: [
          { field: 'assignee', op: 'is_empty' },
          ...(doneStatus ? [{ field: 'newStatus', op: 'eq', value: doneStatus.id }] : []),
        ],
      },
      actions: [
        { type: 'BLOCK_TRANSITION', message: 'Cannot close an issue without an assignee.' },
      ],
    },
  ];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    await prisma.workflowRule.create({
      data: {
        projectId,
        workflowId: workflow.id,
        name: r.name,
        trigger: r.trigger,
        conditions: r.conditions as any,
        actions: r.actions as any,
        priority: i,
        createdById: adminId,
      },
    });
  }

  console.log(`  ${templateKey}: ${rules.length} workflow rules`);
}

// ─── Notifications ─────────────────────────────────────────────────────────

async function seedNotifications(
  projects: ProjectData[],
  projectTemplates: typeof PROJECT_TEMPLATES,
  allUserIds: string[],
) {
  const existingCount = await prisma.notification.count();
  if (existingCount > 0) {
    console.log(`  ${existingCount} notifications already exist, skipping`);
    return;
  }

  const adminId = allUserIds[0]!;
  const notifications: any[] = [];

  for (let pi = 0; pi < projects.length; pi++) {
    const project = projects[pi]!;
    const template = projectTemplates[pi]!;
    const issues = await prisma.issue.findMany({
      where: { projectId: project.projectId },
      select: { id: true, number: true, title: true, assigneeId: true, reporterId: true },
      take: 15,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: project.memberIds } },
      select: { id: true, name: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u.name]));

    for (const issue of issues) {
      const issueKey = `${template.key}-${issue.number}`;
      const recipientId = issue.assigneeId ?? pick(project.memberIds.filter((id) => id !== issue.reporterId));
      if (!recipientId) continue;

      const actorId = issue.reporterId !== recipientId ? issue.reporterId : pick(project.memberIds.filter((id) => id !== recipientId));
      if (!actorId) continue;

      const actorName = userMap.get(actorId) ?? 'Someone';

      // ISSUE_ASSIGNED
      if (issue.assigneeId && faker.datatype.boolean(0.7)) {
        notifications.push({
          userId: issue.assigneeId,
          type: NotificationType.ISSUE_ASSIGNED,
          payload: { actorName, issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key } as any,
          isRead: faker.datatype.boolean(0.5),
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(14),
        });
      }

      // STATUS_CHANGE
      if (faker.datatype.boolean(0.5)) {
        const fromStatus = pick(['Backlog', 'Open', 'In Progress']);
        const toStatus = pick(['In Progress', 'In Review', 'Done']);
        notifications.push({
          userId: recipientId,
          type: NotificationType.STATUS_CHANGE,
          payload: { issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key, fromStatus, toStatus } as any,
          isRead: faker.datatype.boolean(0.4),
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(10),
        });
      }

      // COMMENT_ADD
      if (faker.datatype.boolean(0.6)) {
        notifications.push({
          userId: recipientId,
          type: NotificationType.COMMENT_ADD,
          payload: { actorName, issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key, commentPreview: faker.lorem.sentence() } as any,
          isRead: faker.datatype.boolean(0.3),
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(7),
        });
      }

      // MENTION
      if (faker.datatype.boolean(0.3)) {
        notifications.push({
          userId: recipientId,
          type: NotificationType.MENTION,
          payload: { actorName, issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key } as any,
          isRead: faker.datatype.boolean(0.2),
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(5),
        });
      }

      // ISSUE_RESOLVED
      if (faker.datatype.boolean(0.3)) {
        notifications.push({
          userId: recipientId,
          type: NotificationType.ISSUE_RESOLVED,
          payload: { issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key } as any,
          isRead: faker.datatype.boolean(0.5),
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(3),
        });
      }

      // DUE_DATE
      if (faker.datatype.boolean(0.2)) {
        notifications.push({
          userId: recipientId,
          type: NotificationType.DUE_DATE,
          payload: { issueKey, issueTitle: issue.title, issueNumber: String(issue.number), projectKey: template.key } as any,
          isRead: false,
          issueId: issue.id,
          projectId: project.projectId,
          createdAt: daysAgo(1),
        });
      }
    }

    // Sprint notifications
    if (project.sprintIds.length > 0) {
      const sprints = await prisma.sprint.findMany({
        where: { id: { in: project.sprintIds } },
        select: { id: true, name: true, status: true },
      });

      for (const sprint of sprints) {
        if (sprint.status === SprintStatus.ACTIVE) {
          for (const userId of project.memberIds.slice(0, 5)) {
            notifications.push({
              userId,
              type: NotificationType.SPRINT_STARTED,
              payload: { sprintName: sprint.name, projectKey: template.key } as any,
              isRead: faker.datatype.boolean(0.6),
              projectId: project.projectId,
              createdAt: daysAgo(12),
            });
          }
        }
        if (sprint.status === SprintStatus.CLOSED) {
          for (const userId of project.memberIds.slice(0, 5)) {
            notifications.push({
              userId,
              type: NotificationType.SPRINT_CLOSED,
              payload: { sprintName: sprint.name, projectKey: template.key } as any,
              isRead: faker.datatype.boolean(0.8),
              projectId: project.projectId,
              createdAt: daysAgo(15),
            });
          }
        }
      }
    }

    // ADDED_TO_PROJECT for non-admin members
    for (const userId of project.memberIds.filter((id) => id !== adminId).slice(0, 4)) {
      notifications.push({
        userId,
        type: NotificationType.ADDED_TO_PROJECT,
        payload: { projectKey: template.key } as any,
        isRead: true,
        projectId: project.projectId,
        createdAt: daysAgo(30),
      });
    }
  }

  await prisma.notification.createMany({ data: notifications });
  console.log(`  ${notifications.length} notifications created`);
}

// ─── Custom Field Values ────────────────────────────────────────────────────

async function seedCustomFieldValues(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, customFieldIds } = projectData;

  if (customFieldIds.length === 0) return;

  const existingCount = await prisma.customFieldValue.count({
    where: { issue: { projectId } },
  });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: custom field values already exist, skipping`);
    return;
  }

  const fields = await prisma.customField.findMany({
    where: { id: { in: customFieldIds } },
  });
  const issues = await prisma.issue.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true },
  });

  const values: { issueId: string; customFieldId: string; value: any }[] = [];
  for (const issue of issues) {
    for (const field of fields) {
      if (!faker.datatype.boolean(0.7)) continue;
      const value = generateFieldValue(field.type, field.config);
      if (value === null) continue;
      values.push({ issueId: issue.id, customFieldId: field.id, value });
    }
  }

  if (values.length > 0) {
    await prisma.customFieldValue.createMany({ data: values });
  }

  console.log(`  ${templateKey}: ${values.length} custom field values`);
}

function generateFieldValue(type: CustomFieldType, config: any): unknown {
  switch (type) {
    case CustomFieldType.ENUM: {
      const options = (config?.options ?? []) as { id: string }[];
      if (options.length === 0) return null;
      return pick(options).id;
    }
    case CustomFieldType.NUMBER: {
      const min = config?.min ?? 1;
      const max = config?.max ?? 100;
      return faker.number.int({ min, max });
    }
    case CustomFieldType.DATE: {
      const offsetDays = faker.number.int({ min: -30, max: 30 });
      return new Date(Date.now() + offsetDays * 86400000).toISOString();
    }
    case CustomFieldType.TEXT: {
      const maxLength = config?.maxLength ?? 200;
      const text = faker.lorem.sentence();
      return text.length > maxLength ? text.slice(0, maxLength) : text;
    }
    default:
      return null;
  }
}

// ─── Attachments (DB-only — no MinIO upload) ────────────────────────────────

const ATTACHMENT_FIXTURES: { filename: string; mimeType: string; sizeRange: [number, number] }[] = [
  { filename: 'screenshot.png', mimeType: 'image/png', sizeRange: [80_000, 800_000] },
  { filename: 'design-mockup.jpg', mimeType: 'image/jpeg', sizeRange: [200_000, 2_000_000] },
  { filename: 'error-log.txt', mimeType: 'text/plain', sizeRange: [2_000, 50_000] },
  { filename: 'spec.pdf', mimeType: 'application/pdf', sizeRange: [100_000, 3_000_000] },
  { filename: 'data-export.csv', mimeType: 'text/csv', sizeRange: [5_000, 250_000] },
  { filename: 'repro-bundle.zip', mimeType: 'application/zip', sizeRange: [500_000, 5_000_000] },
];

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot);
}

async function seedAttachments(projectData: ProjectData, templateKey: string): Promise<void> {
  const { projectId, memberIds } = projectData;

  const existingCount = await prisma.attachment.count({
    where: { issue: { projectId } },
  });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: attachments already exist, skipping`);
    return;
  }

  const issues = await prisma.issue.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, createdAt: true },
  });

  const attachments: any[] = [];
  for (const issue of issues) {
    if (!faker.datatype.boolean(0.2)) continue;

    const attachmentsForIssue = faker.number.int({ min: 1, max: 2 });
    for (let i = 0; i < attachmentsForIssue; i++) {
      const fixture = pick(ATTACHMENT_FIXTURES);
      const attachmentId = randomUUID();
      const ext = fileExtension(fixture.filename);
      const isImage = fixture.mimeType.startsWith('image/');

      attachments.push({
        id: attachmentId,
        issueId: issue.id,
        uploadedById: pick(memberIds),
        filename: fixture.filename,
        storagePath: `attachments/${issue.id}/${attachmentId}${ext}`,
        mimeType: fixture.mimeType,
        size: faker.number.int({ min: fixture.sizeRange[0], max: fixture.sizeRange[1] }),
        thumbnailPath: isImage ? `attachments/${issue.id}/${attachmentId}.thumb${ext}` : null,
        width: isImage ? faker.number.int({ min: 800, max: 2560 }) : null,
        height: isImage ? faker.number.int({ min: 600, max: 1600 }) : null,
        createdAt: faker.date.between({ from: issue.createdAt, to: new Date() }),
      });
    }
  }

  if (attachments.length > 0) {
    await prisma.attachment.createMany({ data: attachments });
  }

  console.log(`  ${templateKey}: ${attachments.length} attachments (DB-only; download will 404)`);
}

// ─── Notification Preferences ───────────────────────────────────────────────

function buildDefaultChannelSettings(): Record<string, { inApp: boolean; email: boolean }> {
  const settings: Record<string, { inApp: boolean; email: boolean }> = {};
  for (const type of Object.values(NotificationType)) {
    settings[type] = { inApp: true, email: false };
  }
  // High-signal types also email by default
  settings[NotificationType.ISSUE_ASSIGNED] = { inApp: true, email: true };
  settings[NotificationType.MENTION] = { inApp: true, email: true };
  settings[NotificationType.ADDED_TO_PROJECT] = { inApp: true, email: true };
  return settings;
}

async function seedNotificationPreferences(userIds: string[], projects: ProjectData[]): Promise<void> {
  const existingCount = await prisma.notificationPreferences.count();
  if (existingCount > 0) {
    console.log(`  notification preferences already exist, skipping`);
    return;
  }

  const defaults = buildDefaultChannelSettings();
  const prefs = userIds.map((userId, i) => ({
    userId,
    // Vary so the UI shows non-uniform data:
    // - Second user: mutes one project
    // - Every 4th user: digest email mode
    // - Every 5th user: email disabled entirely
    emailMode: i % 4 === 0 ? EmailMode.DIGEST : EmailMode.INSTANT,
    emailEnabled: i % 5 !== 0,
    channelSettings: defaults as any,
    mutedProjectIds: i === 1 && projects.length > 0 ? [projects[0]!.projectId] : [],
    mutedIssueIds: [],
  }));

  await prisma.notificationPreferences.createMany({ data: prefs });
  console.log(`  ${prefs.length} notification preferences`);
}

// ─── Invites ────────────────────────────────────────────────────────────────

async function seedInvites(adminId: string): Promise<void> {
  const existingCount = await prisma.invite.count();
  if (existingCount > 0) {
    console.log(`  invites already exist, skipping`);
    return;
  }

  const now = Date.now();
  const inviteDefs = [
    {
      email: 'pending.dev@example.com',
      role: GlobalRole.USER,
      status: InviteStatus.PENDING,
      expiresAt: new Date(now + 7 * 86400000),
    },
    {
      email: 'pending.admin@example.com',
      role: GlobalRole.ADMIN,
      status: InviteStatus.PENDING,
      expiresAt: new Date(now + 3 * 86400000),
    },
    {
      email: 'expired.invitee@example.com',
      role: GlobalRole.USER,
      status: InviteStatus.EXPIRED,
      expiresAt: new Date(now - 2 * 86400000),
    },
    {
      email: 'revoked.invitee@example.com',
      role: GlobalRole.USER,
      status: InviteStatus.REVOKED,
      expiresAt: new Date(now + 7 * 86400000),
    },
  ];

  for (const inv of inviteDefs) {
    await prisma.invite.create({
      data: {
        email: inv.email,
        role: inv.role,
        senderId: adminId,
        status: inv.status,
        expiresAt: inv.expiresAt,
      },
    });
  }

  console.log(`  ${inviteDefs.length} invites (2 pending, 1 expired, 1 revoked)`);
}

// ─── Project Webhooks ───────────────────────────────────────────────────────

async function seedWebhooks(projectData: ProjectData, templateKey: string, adminId: string): Promise<void> {
  const { projectId } = projectData;

  const existingCount = await prisma.projectWebhook.count({ where: { projectId } });
  if (existingCount > 0) {
    console.log(`  ${templateKey}: webhooks already exist, skipping`);
    return;
  }

  const webhookDefs = [
    {
      name: 'Slack notifications',
      url: `https://hooks.slack.com/services/T000/B000/${randomBytes(12).toString('hex')}`,
      eventTypes: ['ASSIGNEE_CHANGED', 'STATUS_CHANGED', 'ISSUE_RESOLVED'] as const,
      isEnabled: true,
    },
    {
      name: 'Internal audit log',
      url: 'https://audit.internal.example.com/webhooks/issues',
      eventTypes: [...WEBHOOK_EVENT_TYPES],
      isEnabled: false,
      disabledReason: 'Audit endpoint under maintenance',
    },
  ];

  for (const def of webhookDefs) {
    await prisma.projectWebhook.create({
      data: {
        projectId,
        name: def.name,
        url: def.url,
        secret: randomBytes(32).toString('hex'),
        eventTypes: [...def.eventTypes],
        isEnabled: def.isEnabled,
        disabledAt: def.isEnabled ? null : new Date(),
        disabledReason: def.isEnabled ? null : def.disabledReason ?? null,
        createdById: adminId,
      },
    });
  }

  console.log(`  ${templateKey}: ${webhookDefs.length} webhooks`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding dev data...\n');

  console.log('[01/14] System Roles');
  await seedSystemRoles();

  console.log('[02/14] Users');
  const userIds = await seedUsers();
  const adminId = userIds[0]!;

  console.log('[03/14] Projects');
  const projectTemplates = PROJECT_TEMPLATES.slice(0, COUNTS.projects);
  const projects: ProjectData[] = [];
  for (let pi = 0; pi < projectTemplates.length; pi++) {
    projects.push(await seedProject(projectTemplates[pi], userIds, adminId, pi));
  }

  console.log('[04/14] Issues & Activities');
  for (let i = 0; i < projects.length; i++) {
    await seedIssues(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[05/14] Custom Field Values');
  for (let i = 0; i < projects.length; i++) {
    await seedCustomFieldValues(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[06/14] Attachments');
  for (let i = 0; i < projects.length; i++) {
    await seedAttachments(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[07/14] Time Logs');
  for (let i = 0; i < projects.length; i++) {
    await seedTimeLogs(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[08/14] Issue Links');
  for (let i = 0; i < projects.length; i++) {
    await seedIssueLinks(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[09/14] Teams & Auto-assign');
  for (let i = 0; i < projects.length; i++) {
    await seedTeams(projects[i]!, projectTemplates[i]!.key);
    await seedAutoAssignRules(projects[i]!, projectTemplates[i]!.key);
  }

  console.log('[10/14] Webhooks');
  for (let i = 0; i < projects.length; i++) {
    await seedWebhooks(projects[i]!, projectTemplates[i]!.key, adminId);
  }

  console.log('[11/14] Knowledge Base & Workflow Rules');
  for (let i = 0; i < projects.length; i++) {
    await seedArticles(projects[i]!, projectTemplates[i]!.key, adminId);
    await seedWorkflowRules(projects[i]!, projectTemplates[i]!.key, adminId);
  }

  console.log('[12/14] Dashboards');
  await seedDashboards(adminId);

  console.log('[13/14] Invites');
  await seedInvites(adminId);

  console.log('[14/14] Notification Preferences & Notifications');
  await seedNotificationPreferences(userIds, projects);
  await seedNotifications(projects, projectTemplates, userIds);

  console.log('\nDev seed complete!');
  console.log(`\nAll users share password: ${PASSWORD}`);
  console.log(`Admin: ${ADMIN_EMAIL}`);
  console.log('Team:  jordan.rivera@company.dev, sam.chen@company.dev, ...');

  printReindexBanner();
}

/**
 * Seeding writes only to Postgres — it bypasses the indexer hooks that keep
 * Elasticsearch in sync. The project issue list is backed by `GET /search`
 * (Elasticsearch), so seeded issues stay invisible until ES is reindexed.
 * Reindex is exposed as an admin-only endpoint; print a ready-to-run curl.
 */
function printReindexBanner(): void {
  const base = `http://localhost:${process.env.API_PORT ?? '3001'}/api`;
  console.log(`
────────────────────────────────────────────────────────────────────
  ACTION REQUIRED: reindex Elasticsearch
────────────────────────────────────────────────────────────────────
  Seeded issues live only in Postgres. The issue list reads from
  Elasticsearch (GET /search), so it stays empty until you reindex.

  With the API running (pnpm dev), run:

    # 1) log in as admin (saves the httpOnly auth cookies)
    curl -c /tmp/nt-cookies.txt -X POST ${base}/auth/login \\
      -H 'Content-Type: application/json' \\
      -d '{"email":"${ADMIN_EMAIL}","password":"${PASSWORD}"}'

    # 2) trigger a full reindex (admin only)
    curl -b /tmp/nt-cookies.txt -X POST ${base}/search/reindex \\
      -H 'Content-Type: application/json' -d '{}'
────────────────────────────────────────────────────────────────────`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
