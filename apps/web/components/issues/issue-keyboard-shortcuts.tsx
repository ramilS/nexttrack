'use client';

import { useState, useCallback, useMemo } from 'react';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { useUpdateIssue } from '@/lib/hooks/use-issues';
import { useAuthStore } from '@/lib/stores/auth.store';
import { FloatingPicker } from '@/components/shared/floating-picker';
import type { IssueDetail } from '@repo/shared/schemas';
import type { ProjectMember, WorkflowStatus } from '@repo/shared/schemas';
import type { Tag } from '@/lib/api/tags.api';
import type { CommandOption } from '@/lib/commands/command-registry';
import { ISSUE_PRIORITY_OPTIONS, ISSUE_TYPE_OPTIONS } from '@repo/shared';
import type { IssuePriority, IssueType } from '@repo/shared/schemas';
import { useRouter } from 'next/navigation';
import { addDays, addWeeks, addMonths, format } from 'date-fns';

type PickerType = 'priority' | 'status' | 'tag' | 'member' | 'type' | 'dueDate' | null;

interface IssueKeyboardShortcutsProps {
  issue: IssueDetail;
  projectKey: string;
  onLogTime?: () => void;
  onToggleEditing?: () => void;
  statuses?: WorkflowStatus[];
  members?: ProjectMember[];
  tags?: Tag[];
}

const PRIORITY_KEYWORDS: Record<string, string[]> = {
  CRITICAL: ['critical', 'p0'],
  HIGH: ['high', 'p1'],
  MEDIUM: ['medium', 'p2'],
  LOW: ['low', 'p3'],
};

const PRIORITY_OPTIONS: CommandOption[] = [
  ...ISSUE_PRIORITY_OPTIONS.map((o) => ({
    id: o.value,
    label: o.label,
    keywords: PRIORITY_KEYWORDS[o.value],
  })),
  { id: 'NONE', label: 'None', keywords: ['none'] },
];

const TYPE_OPTIONS: CommandOption[] = ISSUE_TYPE_OPTIONS.map((o) => ({
  id: o.value,
  label: o.label,
}));

function getDueDateOptions(): CommandOption[] {
  const today = new Date();
  return [
    { id: format(today, 'yyyy-MM-dd'), label: 'Today' },
    { id: format(addDays(today, 1), 'yyyy-MM-dd'), label: 'Tomorrow' },
    { id: format(addWeeks(today, 1), 'yyyy-MM-dd'), label: 'In 1 week' },
    { id: format(addWeeks(today, 2), 'yyyy-MM-dd'), label: 'In 2 weeks' },
    { id: format(addMonths(today, 1), 'yyyy-MM-dd'), label: 'In 1 month' },
    { id: '__remove__', label: 'Remove due date', keywords: ['remove', 'clear'] },
  ];
}

export function IssueKeyboardShortcuts({
  issue,
  projectKey,
  onLogTime,
  onToggleEditing,
  statuses = [],
  members = [],
  tags = [],
}: IssueKeyboardShortcutsProps) {
  const updateIssue = useUpdateIssue();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [activePicker, setActivePicker] = useState<PickerType>(null);

  const closePicker = useCallback(() => setActivePicker(null), []);

  // A — Assign to me
  useKeyboardShortcut({ key: 'a' }, () => {
    if (user) {
      updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { assigneeId: user.id } });
    }
  });

  // E — Toggle edit mode
  useKeyboardShortcut({ key: 'e' }, () => {
    onToggleEditing?.();
  });

  // [ — Previous issue
  useKeyboardShortcut({ key: '[' }, () => {
    if (issue.number > 1) {
      router.push(`/projects/${projectKey}/issues/${issue.number - 1}`);
    }
  });

  // ] — Next issue
  useKeyboardShortcut({ key: ']' }, () => {
    router.push(`/projects/${projectKey}/issues/${issue.number + 1}`);
  });

  // T — Log time
  useKeyboardShortcut({ key: 't' }, () => {
    onLogTime?.();
  });

  // P — Priority picker
  useKeyboardShortcut({ key: 'p' }, () => {
    setActivePicker((prev) => (prev === 'priority' ? null : 'priority'));
  });

  // S — Status picker
  useKeyboardShortcut({ key: 's' }, () => {
    setActivePicker((prev) => (prev === 'status' ? null : 'status'));
  });

  // L — Tag picker
  useKeyboardShortcut({ key: 'l' }, () => {
    setActivePicker((prev) => (prev === 'tag' ? null : 'tag'));
  });

  // M — Member picker
  useKeyboardShortcut({ key: 'm' }, () => {
    setActivePicker((prev) => (prev === 'member' ? null : 'member'));
  });

  // I — Type picker
  useKeyboardShortcut({ key: 'i' }, () => {
    setActivePicker((prev) => (prev === 'type' ? null : 'type'));
  });

  // D — Due date picker
  useKeyboardShortcut({ key: 'd' }, () => {
    setActivePicker((prev) => (prev === 'dueDate' ? null : 'dueDate'));
  });

  const statusOptions = useMemo<CommandOption[]>(
    () =>
      statuses.map((s) => ({
        id: s.id,
        label: s.name,
        keywords: [s.name.toLowerCase(), s.category.toLowerCase()],
      })),
    [statuses],
  );

  const memberOptions = useMemo<CommandOption[]>(() => {
    const opts: CommandOption[] = [];
    if (user) {
      opts.push({ id: user.id, label: 'Me', keywords: ['me', user.name.toLowerCase()] });
    }
    opts.push({ id: '__none__', label: 'Unassigned', keywords: ['unassign', 'none'] });
    for (const m of members) {
      if (m.user.id === user?.id) continue;
      opts.push({ id: m.user.id, label: m.user.name, keywords: [m.user.name.toLowerCase()] });
    }
    return opts;
  }, [members, user]);

  const tagOptions = useMemo<CommandOption[]>(() => {
    const existingIds = new Set(issue.tags.map((t) => t.id));
    return tags
      .filter((t) => !existingIds.has(t.id))
      .map((t) => ({ id: t.id, label: t.name, color: t.color }));
  }, [tags, issue.tags]);

  function handlePickerSelect(optionId: string) {
    switch (activePicker) {
      case 'priority':
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { priority: optionId as IssuePriority } });
        break;
      case 'status':
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { statusId: optionId } });
        break;
      case 'type':
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { type: optionId as IssueType } });
        break;
      case 'member': {
        const assigneeId = optionId === '__none__' ? null : optionId;
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { assigneeId } });
        break;
      }
      case 'tag': {
        const currentTagIds = issue.tags.map((t) => t.id);
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { tagIds: [...currentTagIds, optionId] } });
        break;
      }
      case 'dueDate': {
        const dueDate = optionId === '__remove__' ? null : optionId;
        updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data: { dueDate } });
        break;
      }
    }
  }

  function getPickerConfig(): { title: string; options: CommandOption[]; currentValue?: string } | null {
    switch (activePicker) {
      case 'priority':
        return { title: 'Set Priority', options: PRIORITY_OPTIONS, currentValue: issue.priority };
      case 'status':
        return {
          title: 'Set Status',
          options: statusOptions,
          currentValue:
            typeof issue.status === 'string' ? issue.status : (issue.status?.id ?? undefined),
        };
      case 'type':
        return { title: 'Set Type', options: TYPE_OPTIONS, currentValue: issue.type };
      case 'member':
        return { title: 'Assign to...', options: memberOptions, currentValue: issue.assignee?.id };
      case 'tag':
        return { title: 'Add Tag', options: tagOptions };
      case 'dueDate':
        return { title: 'Set Due Date', options: getDueDateOptions(), currentValue: issue.dueDate ?? undefined };
      default:
        return null;
    }
  }

  const pickerConfig = getPickerConfig();

  return (
    <>
      {pickerConfig && (
        <FloatingPicker
          title={pickerConfig.title}
          options={pickerConfig.options}
          currentValue={pickerConfig.currentValue}
          onSelect={handlePickerSelect}
          onClose={closePicker}
        />
      )}
    </>
  );
}
