'use client';

import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { SprintPanel } from './sprint-panel';
import { BoardCard } from './board-card';
import { CloseSprintDialog } from './close-sprint-dialog';
import { CreateSprintDialog } from './create-sprint-dialog';
import {
  useSprintBacklog,
  useStartSprint,
  useCloseSprint,
} from '@/lib/hooks/use-sprints';
import type { SprintWithIssues } from '@/lib/api/boards.api';

interface SprintBacklogProps {
  projectKey: string;
  boardId: string;
}

export function SprintBacklog({ projectKey, boardId }: SprintBacklogProps) {
  const { data, isLoading } = useSprintBacklog(boardId);
  const startSprint = useStartSprint(boardId);
  const closeSprint = useCloseSprint(boardId);
  const [closingSprintId, setClosingSprintId] = useState<string | null>(null);
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return <AsyncContent loading className="py-16" spinnerClassName="size-6">{null}</AsyncContent>;
  }

  if (!data) return null;

  const { sprints, backlog } = data;
  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const planningSprints = sprints.filter((s) => s.status === 'PLANNING');
  const closingSprint = sprints.find((s) => s.id === closingSprintId);

  return (
    <div className="space-y-3">
      {/* Active sprint */}
      {activeSprint && (
        <SprintSection
          sprint={activeSprint}
          projectKey={projectKey}
          collapsed={collapsedSections.has(activeSprint.id)}
          onToggle={() => toggleSection(activeSprint.id)}
          action={
            <Button size="sm" variant="outline" onClick={() => setClosingSprintId(activeSprint.id)}>
              Complete Sprint
            </Button>
          }
        />
      )}

      {/* Planning sprints */}
      {planningSprints.map((sprint) => (
        <SprintSection
          key={sprint.id}
          sprint={sprint}
          projectKey={projectKey}
          collapsed={collapsedSections.has(sprint.id)}
          onToggle={() => toggleSection(sprint.id)}
          action={
            <Button size="sm" onClick={() => startSprint.mutate({ sprintId: sprint.id })}>
              Start Sprint
            </Button>
          }
        />
      ))}

      {/* Create sprint */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => setCreateSprintOpen(true)}
      >
        <Plus className="size-3.5" />
        Create Sprint
      </Button>

      <CreateSprintDialog
        open={createSprintOpen}
        onOpenChange={setCreateSprintOpen}
        boardId={boardId}
        suggestedName={`Sprint ${sprints.length + 1}`}
      />

      {/* Backlog */}
      <div className="rounded-lg border border-border">
        <button
          className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
          onClick={() => toggleSection('__backlog__')}
        >
          {collapsedSections.has('__backlog__') ? (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">Backlog</span>
          <span className="text-xs text-muted-foreground">
            {backlog.issues.length} issue{backlog.issues.length !== 1 ? 's' : ''}
          </span>
        </button>

        {!collapsedSections.has('__backlog__') && (
          <div className="border-t border-border">
            {backlog.issues.length > 0 ? (
              <div className="divide-y divide-border">
                {backlog.issues.map((issue) => (
                  <div key={issue.id} className="px-3 py-1">
                    <BoardCard issue={issue} projectKey={projectKey} className="border-0 px-0 py-1 rounded-none hover:shadow-none" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                No issues in backlog
              </p>
            )}
          </div>
        )}
      </div>

      {/* Close sprint dialog */}
      {closingSprint && (
        <CloseSprintDialog
          open={!!closingSprintId}
          onOpenChange={(open) => { if (!open) setClosingSprintId(null); }}
          sprint={closingSprint}
          nextSprints={planningSprints}
          onClose={(data) => {
            closeSprint.mutate(
              { sprintId: closingSprint.id, data },
              { onSuccess: () => setClosingSprintId(null) },
            );
          }}
          isPending={closeSprint.isPending}
        />
      )}
    </div>
  );
}

interface SprintSectionProps {
  sprint: SprintWithIssues;
  projectKey: string;
  collapsed: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}

function SprintSection({ sprint, projectKey, collapsed, onToggle, action }: SprintSectionProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Sprint header — clickable to collapse */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold truncate">{sprint.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {sprint.completedIssues}/{sprint.totalIssues} issues
          </span>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Sprint meta + progress (always visible) */}
      <SprintPanel sprint={sprint} compact />

      {/* Issues list */}
      {!collapsed && sprint.issues.length > 0 && (
        <div className="border-t border-border divide-y divide-border">
          {sprint.issues.map((issue) => (
            <div key={issue.id} className="px-3 py-1">
              <BoardCard issue={issue} projectKey={projectKey} className="border-0 px-0 py-1 rounded-none hover:shadow-none" />
            </div>
          ))}
        </div>
      )}

      {!collapsed && sprint.issues.length === 0 && (
        <div className="border-t border-border">
          <p className="text-xs text-muted-foreground text-center py-4">
            No issues in this sprint
          </p>
        </div>
      )}
    </div>
  );
}
