'use client';

import React, { useRef, useState, useMemo } from 'react';
import { Eye, EyeOff, BellOff, Bell, X, Plus, Search, Check, Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseDuration, formatDuration } from '@/components/shared/duration-input';
import { TagBadge } from '@/components/shared/tag-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { UserAvatar } from '@/components/shared/user-avatar';
import { RelativeTime } from '@/components/shared/relative-time';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { FieldRenderer } from '@/components/custom-fields/field-renderer';
import { TimerButton } from '@/components/time-tracking/timer-button';
import { TimeLogsList } from '@/components/time-tracking/time-logs-list';
import { useUpdateIssue, useToggleWatch } from '@/lib/hooks/use-issues';
import { useProjectMembers, useWorkflowStatuses } from '@/lib/hooks/use-projects';
import { useCurrentUser } from '@/lib/hooks/use-auth';
import { useCustomFields, useIssueFieldValues, useSetFieldValue } from '@/lib/hooks/use-custom-fields';
import { useTags, useAddTagToIssue, useRemoveTagFromIssue } from '@/lib/hooks/use-tags';
import { useMuteIssue } from '@/lib/hooks/use-mute-notifications';
import { useBoards } from '@/lib/hooks/use-boards';
import { useSprints } from '@/lib/hooks/use-sprints';
import { ISSUE_TYPE_OPTIONS, ISSUE_PRIORITY_OPTIONS } from '@repo/shared';
import { ISSUE_ESTIMATE_MIN, ISSUE_ESTIMATE_MAX } from '@repo/shared/schemas';
import type { IssueDetail } from '@repo/shared/schemas';
import { cn } from '@/lib/utils';


interface IssueSidebarProps {
  issue: IssueDetail;
  projectKey: string;
  className?: string;
  readOnly?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function IssueSidebar({ issue, projectKey, className, readOnly, onDelete, isDeleting }: IssueSidebarProps) {
  const updateIssue = useUpdateIssue();
  const toggleWatch = useToggleWatch();
  const { data: workflowStatuses } = useWorkflowStatuses(projectKey);
  const { data: currentUser } = useCurrentUser();
  const { isMuted: isIssueMuted, toggleMute: toggleIssueMute } = useMuteIssue();
  const { data: customFields } = useCustomFields(projectKey);
  const { data: fieldValues } = useIssueFieldValues(issue.id);
  const setFieldValue = useSetFieldValue();

  // Tags
  const { data: projectTags } = useTags(projectKey);
  const addTag = useAddTagToIssue();
  const removeTag = useRemoveTagFromIssue();
  const availableTags = projectTags?.filter((t) => !issue.tags.some((it) => it.id === t.id)) ?? [];

  // Sprints
  const { data: boards } = useBoards(projectKey);
  const scrumBoard = boards?.find((b) => b.type === 'SCRUM') ?? boards?.find((b) => b.isDefault);
  const { data: sprints } = useSprints(scrumBoard?.id ?? '');
  const selectableSprints = sprints?.filter((s) => s.status === 'ACTIVE' || s.status === 'PLANNING') ?? [];

  function handleUpdate(data: Record<string, unknown>) {
    updateIssue.mutate({ projectKey, issueNumber: issue.number, issueId: issue.id, data });
  }

  function getFieldValue(fieldId: string): unknown {
    const entry = fieldValues?.find((fv) => fv.fieldId === fieldId);
    return entry?.value ?? null;
  }

  return (
    <aside className={cn('text-xs', className)}>
      {/* Core fields — compact inline grid */}
      <div className="grid grid-cols-[80px_1fr] items-center gap-x-2 gap-y-0.5">
        <SidebarLabel>Status</SidebarLabel>
        {readOnly ? (
          <SidebarValue><StatusBadge status={issue.status} /></SidebarValue>
        ) : (
          <Select
            value={issue.status?.id ?? ''}
            onValueChange={(v: string | null) => { if (v) handleUpdate({ statusId: v }); }}
          >
            <SelectTrigger data-testid="issue-status" className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50">
              <SelectValue>
                <StatusBadge status={issue.status} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {workflowStatuses?.map((s) => (
                <SelectItem key={s.id} value={s.id} label={s.name}>
                  <StatusBadge status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <SidebarLabel>Assignee</SidebarLabel>
        {readOnly ? (
          <SidebarValue>
            {issue.assignee ? (
              <span className="flex items-center gap-1.5">
                <UserAvatar user={issue.assignee} size="xxs" />
                <span className="truncate">{issue.assignee.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </SidebarValue>
        ) : (
          <AssigneePicker
            projectKey={projectKey}
            currentUserId={currentUser?.id ?? null}
            value={issue.assignee?.id ?? null}
            assignee={issue.assignee}
            onChange={(assigneeId) => handleUpdate({ assigneeId })}
          />
        )}

        <SidebarLabel>Priority</SidebarLabel>
        {readOnly ? (
          <SidebarValue><PriorityBadge priority={issue.priority} /></SidebarValue>
        ) : (
          <Select value={issue.priority} onValueChange={(v: string | null) => { if (v) handleUpdate({ priority: v }); }}>
            <SelectTrigger data-testid="issue-priority" className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50">
              <SelectValue>
                <PriorityBadge priority={issue.priority} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ISSUE_PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value} label={p.label}>
                  <PriorityBadge priority={p.value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <SidebarLabel>Type</SidebarLabel>
        {readOnly ? (
          <SidebarValue>
            <span className="flex items-center gap-1.5">
              <IssueTypeIcon type={issue.type} className="size-3.5" />
              <span>{ISSUE_TYPE_OPTIONS.find((t) => t.value === issue.type)?.label ?? issue.type}</span>
            </span>
          </SidebarValue>
        ) : (
          <Select value={issue.type} onValueChange={(v: string | null) => { if (v) handleUpdate({ type: v }); }}>
            <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <IssueTypeIcon type={issue.type} className="size-3.5" />
                  <span>{ISSUE_TYPE_OPTIONS.find((t) => t.value === issue.type)?.label ?? issue.type}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ISSUE_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value} label={t.label}>
                  <IssueTypeIcon type={t.value} className="size-3.5" />
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {scrumBoard && (
          <>
            <SidebarLabel>Sprint</SidebarLabel>
            {readOnly ? (
              <SidebarValue>
                {issue.sprintId
                  ? <span>{selectableSprints.find((s) => s.id === issue.sprintId)?.name ?? 'Sprint'}</span>
                  : <span className="text-muted-foreground">No sprint</span>}
              </SidebarValue>
            ) : (
              <Select
                value={issue.sprintId ?? '__none__'}
                onValueChange={(v: string | null) => {
                  if (v) handleUpdate({ sprintId: v === '__none__' ? null : v });
                }}
              >
                <SelectTrigger className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50">
                  <SelectValue>
                    {issue.sprintId
                      ? selectableSprints.find((s) => s.id === issue.sprintId)?.name ?? 'Sprint'
                      : <span className="text-muted-foreground">No sprint</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" label="No sprint">
                    <span className="text-muted-foreground">No sprint</span>
                  </SelectItem>
                  {selectableSprints.map((s) => (
                    <SelectItem key={s.id} value={s.id} label={s.name}>
                      {s.name}
                      {s.status === 'ACTIVE' && (
                        <span className="text-[10px] text-primary ml-1">(active)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        <SidebarLabel>Due date</SidebarLabel>
        {readOnly ? (
          <SidebarValue>
            {issue.dueDate
              ? formatDueDate(issue.dueDate)
              : <span className="text-muted-foreground">—</span>}
          </SidebarValue>
        ) : (
          <DueDateField
            value={issue.dueDate}
            onChange={(dueDate) => handleUpdate({ dueDate })}
          />
        )}

        <SidebarLabel>Estimate</SidebarLabel>
        {readOnly ? (
          <SidebarValue>
            {issue.estimate
              ? formatDuration(issue.estimate)
              : <span className="text-muted-foreground">—</span>}
          </SidebarValue>
        ) : (
          <EstimateField
            value={issue.estimate}
            onChange={(estimate) => handleUpdate({ estimate })}
          />
        )}
      </div>

      <Separator className="my-3" />

      {/* Tags */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SidebarLabel>Tags</SidebarLabel>
          {!readOnly && availableTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-5" />}>
                <Plus className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                {availableTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={() => addTag.mutate({ issueId: issue.id, tagId: tag.id })}
                  >
                    <TagBadge name={tag.name} color={tag.color} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {issue.tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-0.5">
              <TagBadge name={tag.name} color={tag.color} />
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove tag ${tag.name}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => removeTag.mutate({ issueId: issue.id, tagId: tag.id })}
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}
          {issue.tags.length === 0 && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>

      {/* Custom Fields */}
      {customFields && customFields.length > 0 && (() => {
        const NATIVE_FIELD_NAMES = new Set(['due date', 'duedate', 'due_date', 'estimate']);
        const filteredFields = customFields.filter(
          (f) => !NATIVE_FIELD_NAMES.has(f.name.toLowerCase().trim()),
        );
        if (filteredFields.length === 0) return null;
        return (
          <>
            <Separator className="my-3" />
            <div className="grid grid-cols-[80px_1fr] items-center gap-x-2 gap-y-0.5">
              {filteredFields.map((field) => (
                <React.Fragment key={field.id}>
                  <SidebarLabel>{field.name}</SidebarLabel>
                  <div>
                    <FieldRenderer
                      field={field}
                      value={getFieldValue(field.id)}
                      onChange={readOnly ? undefined : (val) =>
                        setFieldValue.mutate({ issueId: issue.id, fieldId: field.id, value: val })
                      }
                      projectKey={projectKey}
                      inline
                      readOnly={readOnly}
                    />
                  </div>
                </React.Fragment>
              ))}
            </div>
          </>
        );
      })()}

      <Separator className="my-3" />

      {/* Time Tracking */}
      <div className="space-y-2">
        <SidebarLabel>Time tracking</SidebarLabel>
        <TimerButton
          issueId={issue.id}
          issueKey={`${projectKey}-${issue.number}`}
          estimate={issue.estimate}
          spent={issue.spent ?? 0}
        />
        <TimeLogsList issueId={issue.id} estimate={issue.estimate} />
      </div>

      <Separator className="my-3" />

      {/* Watchers + Notifications — compact row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => toggleWatch.mutate({ projectKey, issueNumber: issue.number, isWatching: issue.isWatching })}
        >
          {issue.isWatching ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          <span>{issue.watchers.length} watching</span>
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 transition-colors hover:text-foreground',
            isIssueMuted(issue.id) ? 'text-muted-foreground' : 'text-muted-foreground',
          )}
          onClick={() => toggleIssueMute.mutate(issue.id)}
        >
          {isIssueMuted(issue.id) ? <BellOff className="size-3" /> : <Bell className="size-3" />}
          <span>{isIssueMuted(issue.id) ? 'Muted' : 'Notify'}</span>
        </button>
      </div>

      <Separator className="my-3" />

      {/* Metadata — single compact block */}
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div>
          Created <RelativeTime date={issue.createdAt} className="text-[11px]" />
          {issue.reporter && <> by {issue.reporter.name}</>}
        </div>
        <div>Updated <RelativeTime date={issue.updatedAt} className="text-[11px]" /></div>
      </div>

      {onDelete && (
        <>
          <Separator className="my-3" />
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Delete issue
          </Button>
        </>
      )}
    </aside>
  );
}

// ─── Assignee Picker (lazy-loaded on open) ───────────────────

interface AssigneePickerProps {
  projectKey: string;
  currentUserId: string | null;
  value: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  onChange: (userId: string | null) => void;
}

function AssigneePicker({ projectKey, currentUserId, value, assignee, onChange }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: members, isLoading } = useProjectMembers(open ? projectKey : '');

  const sortedAndFiltered = useMemo(() => {
    if (!members) return [];
    let list = members;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q));
    }
    if (currentUserId) {
      list = [...list].sort((a, b) => {
        if (a.user.id === currentUserId) return -1;
        if (b.user.id === currentUserId) return 1;
        return 0;
      });
    }
    return list;
  }, [members, search, currentUserId]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="h-7 w-full flex items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
          />
        }
      >
        {assignee ? (
          <>
            <UserAvatar user={assignee} size="xxs" />
            <span className="truncate">{assignee.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 pb-1.5">
          <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="h-7 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto px-1 pb-1">
          {value && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              <X className="size-3" />
              Unassign
            </button>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : sortedAndFiltered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">No members found</div>
          ) : (
            sortedAndFiltered.map((member) => (
              <button
                type="button"
                key={member.user.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors',
                  member.user.id === value && 'bg-accent',
                )}
                onClick={() => { onChange(member.user.id); setOpen(false); }}
              >
                <UserAvatar user={member.user} size="xxs" />
                <span className="flex-1 truncate text-left">
                  {member.user.name}
                  {member.user.id === currentUserId && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(me)</span>
                  )}
                </span>
                {member.user.id === value && <Check className="size-3 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// A due date is a calendar day (stored anchored to midnight UTC), so format it in the
// browser's locale but pinned to UTC — otherwise users west of UTC see the previous day.
function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
}

// ─── Due Date Field (inline, click-to-pick) ──────────────────

interface DueDateFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

function DueDateField({ value, onChange }: DueDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValue = value ? value.slice(0, 10) : ''; // yyyy-MM-dd

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const day = e.target.value; // 'yyyy-MM-dd' or ''
    // updateIssueSchema expects a full ISO datetime; anchor the picked day to midnight UTC.
    onChange(day ? new Date(`${day}T00:00:00.000Z`).toISOString() : null);
  }

  return (
    <div className="group/due relative flex items-center">
      <button
        type="button"
        data-testid="issue-due-date"
        className="h-7 flex-1 flex items-center rounded-md px-1.5 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={() => inputRef.current?.showPicker?.()}
      >
        {value
          ? formatDueDate(value)
          : <span className="text-muted-foreground">—</span>}
      </button>
      {value && (
        <button
          type="button"
          aria-label="Clear due date"
          className="px-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/due:opacity-100"
          onClick={() => onChange(null)}
        >
          <X className="size-2.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        aria-label="Due date"
        value={inputValue}
        onChange={handleChange}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
}

// ─── Estimate Field (inline, click-to-edit duration) ─────────

interface EstimateFieldProps {
  value: number | null;
  onChange: (minutes: number | null) => void;
}

function EstimateField({ value, onChange }: EstimateFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const parsed = parseDuration(draft.trim());
  const isEmpty = draft.trim().length === 0;
  const isValid = isEmpty || (parsed !== null && parsed >= ISSUE_ESTIMATE_MIN && parsed <= ISSUE_ESTIMATE_MAX);

  function startEditing() {
    setDraft(value ? formatDuration(value) : '');
    setEditing(true);
  }

  function commit() {
    if (!isValid) return; // keep the editor open so the user can fix it
    const next = isEmpty ? null : parsed;
    if (next !== value) onChange(next);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        data-testid="issue-estimate"
        className="h-7 w-full flex items-center rounded-md px-1.5 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={startEditing}
      >
        {value
          ? formatDuration(value)
          : <span className="text-muted-foreground">—</span>}
      </button>
    );
  }

  return (
    <div className="py-0.5">
      <Input
        autoFocus
        value={draft}
        placeholder="2h 30m"
        aria-label="Estimate"
        aria-invalid={!isValid}
        className="h-7 font-mono text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (isValid ? commit() : setEditing(false))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
      {!isEmpty && !isValid && (
        <p className="mt-0.5 text-[11px] text-destructive">
          Enter 1m–{formatDuration(ISSUE_ESTIMATE_MAX)} (e.g. 2h 30m).
        </p>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] text-muted-foreground truncate py-1">
      {children}
    </span>
  );
}

function SidebarValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center px-1.5 py-1 text-xs">
      {children}
    </span>
  );
}
