import type { Command, CommandContext, CommandOption } from '../command-registry';
import type { UpdateIssueMutationParams } from '@/lib/hooks/use-issues';
import type {
  ProjectMember,
  WorkflowStatus,
  BulkUpdateIssuesInput,
  UpdateIssueInput,
  IssuePriority,
  IssueType,
} from '@repo/shared/schemas';
import type { Tag } from '@/lib/api/tags.api';
import { addDays, addWeeks, addMonths, format } from 'date-fns';

export interface IssueCommandDeps {
  updateIssue: (data: UpdateIssueMutationParams) => void;
  bulkUpdate: (data: { projectKey: string } & BulkUpdateIssuesInput) => void;
  statuses: WorkflowStatus[];
  projectMembers: ProjectMember[];
  tags: Tag[];
}

function applyUpdate(
  ctx: CommandContext,
  data: Partial<UpdateIssueInput>,
  deps: IssueCommandDeps,
) {
  const projectKey = ctx.currentProject?.key;
  if (!projectKey) return;

  if (ctx.selectedIssueIds.length > 0) {
    deps.bulkUpdate({ projectKey, issueIds: ctx.selectedIssueIds, update: data });
  } else if (ctx.activeIssue) {
    deps.updateIssue({ projectKey, issueNumber: ctx.activeIssue.number, issueId: ctx.activeIssue.id, data });
  }
}

const PRIORITIES: CommandOption[] = [
  { id: 'CRITICAL', label: 'Critical', keywords: ['critical', 'p0'] },
  { id: 'HIGH', label: 'High', keywords: ['high', 'p1'] },
  { id: 'MEDIUM', label: 'Medium', keywords: ['medium', 'p2'] },
  { id: 'LOW', label: 'Low', keywords: ['low', 'p3'] },
  { id: 'NONE', label: 'None', keywords: ['none', 'clear'] },
];

const TYPES: CommandOption[] = [
  { id: 'TASK', label: 'Task', keywords: ['task'] },
  { id: 'BUG', label: 'Bug', keywords: ['bug', 'defect'] },
  { id: 'FEATURE', label: 'Feature', keywords: ['feature'] },
  { id: 'STORY', label: 'Story', keywords: ['story', 'user story'] },
  { id: 'EPIC', label: 'Epic', keywords: ['epic'] },
];

function getDueDateOptions(): CommandOption[] {
  const today = new Date();
  return [
    { id: format(today, 'yyyy-MM-dd'), label: 'Today', keywords: ['today'] },
    { id: format(addDays(today, 1), 'yyyy-MM-dd'), label: 'Tomorrow', keywords: ['tomorrow'] },
    { id: format(addWeeks(today, 1), 'yyyy-MM-dd'), label: 'In 1 week', keywords: ['week'] },
    { id: format(addWeeks(today, 2), 'yyyy-MM-dd'), label: 'In 2 weeks', keywords: ['two weeks'] },
    { id: format(addMonths(today, 1), 'yyyy-MM-dd'), label: 'In 1 month', keywords: ['month'] },
    { id: '__remove__', label: 'Remove due date', keywords: ['remove', 'clear', 'none'] },
  ];
}

const hasIssueContext = (ctx: CommandContext) =>
  ctx.activeIssue !== null || ctx.selectedIssueIds.length > 0;

export function createIssueCommands(deps: IssueCommandDeps): Command[] {
  return [
    {
      id: 'set-priority',
      label: 'Set Priority',
      group: 'issue',
      keywords: ['priority', 'urgent', 'high', 'medium', 'low'],
      shortcut: 'P',
      when: hasIssueContext,
      getOptions: () => PRIORITIES,
      execute: (ctx, optionId) => {
        if (optionId) applyUpdate(ctx, { priority: optionId as IssuePriority }, deps);
      },
    },
    {
      id: 'set-status',
      label: 'Set Status',
      group: 'issue',
      keywords: ['status', 'state', 'workflow'],
      shortcut: 'S',
      when: hasIssueContext,
      getOptions: () =>
        deps.statuses.map((s) => ({
          id: s.id,
          label: s.name,
          keywords: [s.name.toLowerCase(), s.category.toLowerCase()],
        })),
      execute: (ctx, optionId) => {
        if (optionId) applyUpdate(ctx, { statusId: optionId }, deps);
      },
    },
    {
      id: 'assign-to',
      label: 'Assign to...',
      group: 'issue',
      keywords: ['assign', 'assignee', 'member', 'user'],
      shortcut: 'M',
      when: hasIssueContext,
      getOptions: (ctx) => {
        const options: CommandOption[] = [];
        if (ctx.currentUser) {
          options.push({
            id: ctx.currentUser.id,
            label: 'Me',
            keywords: ['me', 'myself', ctx.currentUser.name.toLowerCase()],
          });
        }
        options.push({
          id: '__none__',
          label: 'Unassigned',
          keywords: ['unassign', 'remove', 'none'],
        });
        for (const m of deps.projectMembers) {
          if (m.user.id === ctx.currentUser?.id) continue;
          options.push({
            id: m.user.id,
            label: m.user.name,
            keywords: [m.user.name.toLowerCase(), m.user.email.toLowerCase()],
          });
        }
        return options;
      },
      execute: (ctx, optionId) => {
        if (optionId) {
          const assigneeId = optionId === '__none__' ? null : optionId;
          applyUpdate(ctx, { assigneeId }, deps);
        }
      },
    },
    {
      id: 'set-type',
      label: 'Set Type',
      group: 'issue',
      keywords: ['type', 'task', 'bug', 'feature', 'story', 'epic'],
      shortcut: 'I',
      when: hasIssueContext,
      getOptions: () => TYPES,
      execute: (ctx, optionId) => {
        if (optionId) applyUpdate(ctx, { type: optionId as IssueType }, deps);
      },
    },
    {
      id: 'add-tag',
      label: 'Add Tag',
      group: 'issue',
      keywords: ['tag', 'label'],
      shortcut: 'L',
      when: hasIssueContext,
      getOptions: (ctx) => {
        const existingTagIds = new Set(ctx.activeIssue?.tags.map((t) => t.id) ?? []);
        return deps.tags
          .filter((t) => !existingTagIds.has(t.id))
          .map((t) => ({
            id: t.id,
            label: t.name,
            color: t.color,
            keywords: [t.name.toLowerCase()],
          }));
      },
      execute: (ctx, optionId) => {
        if (!optionId) return;
        if (ctx.activeIssue) {
          const currentTagIds = ctx.activeIssue.tags.map((t) => t.id);
          applyUpdate(ctx, { tagIds: [...currentTagIds, optionId] }, deps);
        } else if (ctx.selectedIssueIds.length > 0) {
          const projectKey = ctx.currentProject?.key;
          if (!projectKey) return;
          deps.bulkUpdate({ projectKey, issueIds: ctx.selectedIssueIds, update: { tagIds: [optionId] } });
        }
      },
    },
    {
      id: 'set-due-date',
      label: 'Set Due Date',
      group: 'issue',
      keywords: ['due', 'date', 'deadline'],
      shortcut: 'D',
      when: hasIssueContext,
      getOptions: () => getDueDateOptions(),
      execute: (ctx, optionId) => {
        if (optionId) {
          const dueDate = optionId === '__remove__' ? null : optionId;
          applyUpdate(ctx, { dueDate }, deps);
        }
      },
    },
    {
      id: 'assign-to-me',
      label: 'Assign to me',
      group: 'issue',
      keywords: ['assign', 'me', 'myself'],
      when: (ctx) =>
        hasIssueContext(ctx) && ctx.currentUser !== null,
      execute: (ctx) => {
        if (ctx.currentUser) {
          applyUpdate(ctx, { assigneeId: ctx.currentUser.id }, deps);
        }
      },
    },
  ];
}
