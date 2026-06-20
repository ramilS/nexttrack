'use client';

import { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, Plus, CheckCircle2, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSprintStore } from '@/lib/stores/create-sprint.store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { CreateSprintDialog } from '@/components/sprints/create-sprint-dialog';
import { useSprints, useUpdateSprint } from '@/lib/hooks/use-sprints';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import type { Sprint } from '@/lib/api/boards.api';
import { dateInputToIso, isoToDateInput } from '@/lib/dates';

interface SprintBoardHeaderProps {
  boardId: string;
  currentSprintId: string | undefined;
  onSprintChange: (sprintId: string | undefined) => void;
  activeSprint: Sprint | null | undefined;
  backlogOpen?: boolean;
  onBacklogToggle?: () => void;
}

export function SprintBoardHeader({
  boardId,
  currentSprintId,
  onSprintChange,
  activeSprint,
  backlogOpen,
  onBacklogToggle,
}: SprintBoardHeaderProps) {
  const { data: sprints } = useSprints(boardId);
  const updateSprint = useUpdateSprint(boardId);
  const canManage = useHasPermission(Permission.SPRINT_MANAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const sprintStoreOpen = useCreateSprintStore((s) => s.isOpen);
  const registerBoard = useCreateSprintStore((s) => s.registerBoard);
  const unregisterBoard = useCreateSprintStore((s) => s.unregisterBoard);
  const closeSprintStore = useCreateSprintStore((s) => s.close);

  // Register boardId so cmd+k knows a sprint board is active
  useEffect(() => {
    registerBoard(boardId);
    return () => unregisterBoard();
  }, [boardId, registerBoard, unregisterBoard]);

  // Open dialog when triggered from cmd+k
  useEffect(() => {
    if (sprintStoreOpen) {
      setCreateOpen(true);
      closeSprintStore();
    }
  }, [sprintStoreOpen, closeSprintStore]);

  const activeSprints = sprints?.filter((s) => s.status === 'ACTIVE') ?? [];
  const planningSprints = sprints?.filter((s) => s.status === 'PLANNING') ?? [];
  const allSelectable = [...activeSprints, ...planningSprints];

  const selectedSprint = currentSprintId
    ? allSelectable.find((s) => s.id === currentSprintId)
    : activeSprint ?? activeSprints[0] ?? planningSprints[0];

  // Auto-select first available sprint when none is explicitly chosen
  useEffect(() => {
    if (!currentSprintId && selectedSprint) {
      onSprintChange(selectedSprint.id);
    }
  }, [currentSprintId, selectedSprint, onSprintChange]);

  const daysRemaining = selectedSprint?.endDate
    ? Math.max(0, differenceInDays(new Date(selectedSprint.endDate), new Date()))
    : null;

  const progress = selectedSprint
    ? selectedSprint.totalIssues > 0
      ? Math.round((selectedSprint.completedIssues / selectedSprint.totalIssues) * 100)
      : 0
    : 0;

  const defaultName = `Sprint ${(sprints?.length ?? 0) + 1}`;

  function handleDatesSave(startDate: string, endDate: string) {
    if (!selectedSprint) return;
    updateSprint.mutate({
      sprintId: selectedSprint.id,
      data: {
        startDate: startDate ? dateInputToIso(startDate) : null,
        endDate: endDate ? dateInputToIso(endDate) : null,
      },
    });
    setDatesOpen(false);
  }

  if (allSelectable.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2 px-6 py-2">
          <span className="text-xs text-muted-foreground">No sprints yet.</span>
          {canManage && (
            <Button variant="outline" size="xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3" />
              Create Sprint
            </Button>
          )}
        </div>
        <CreateSprintDialog
          boardId={boardId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultName={defaultName}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border/50">
        {/* Backlog toggle */}
        {onBacklogToggle && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={backlogOpen ? 'secondary' : 'outline'}
                  size="icon-sm"
                  onClick={onBacklogToggle}
                  data-backlog-toggle
                  aria-label="Toggle backlog panel"
                  aria-pressed={backlogOpen}
                />
              }
            >
              <LayoutList className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Backlog</TooltipContent>
          </Tooltip>
        )}

        {/* Sprint selector */}
        <Select
          value={selectedSprint?.id ?? ''}
          onValueChange={(v: string | null) => {
            if (v) onSprintChange(v);
          }}
        >
          <SelectTrigger className="h-7 w-auto text-xs font-medium gap-1">
            <SelectValue placeholder="Select sprint...">
              {(value: string | null) => {
                const sprint = allSelectable.find((s) => s.id === value);
                return sprint?.name ?? 'Select sprint...';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {activeSprints.length > 0 && (
              <>
                {activeSprints.map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.name}>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="default" className="h-4 text-[10px] px-1">Active</Badge>
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
            {planningSprints.length > 0 && (
              <>
                {planningSprints.map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.name}>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="h-4 text-[10px] px-1">Planning</Badge>
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        {/* Date range — clickable to edit (read-only if no SPRINT_MANAGE permission) */}
        {canManage ? (
          <Popover open={datesOpen} onOpenChange={setDatesOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                />
              }
            >
              <Calendar className="size-3" />
              {selectedSprint?.startDate && selectedSprint?.endDate ? (
                <span>
                  {format(new Date(selectedSprint.startDate), 'MMM d')} — {format(new Date(selectedSprint.endDate), 'MMM d')}
                </span>
              ) : (
                <span>Set dates</span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <SprintDateEditor
                startDate={selectedSprint?.startDate ?? null}
                endDate={selectedSprint?.endDate ?? null}
                onSave={handleDatesSave}
              />
            </PopoverContent>
          </Popover>
        ) : selectedSprint?.startDate && selectedSprint?.endDate ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            {format(new Date(selectedSprint.startDate), 'MMM d')} — {format(new Date(selectedSprint.endDate), 'MMM d')}
          </span>
        ) : null}

        {/* Days remaining */}
        {daysRemaining !== null && selectedSprint?.status === 'ACTIVE' && (
          <Badge variant="outline" className="text-[10px] h-5">
            {daysRemaining === 0 ? 'Last day' : `${daysRemaining}d remaining`}
          </Badge>
        )}

        {/* Progress */}
        {selectedSprint && selectedSprint.totalIssues > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3" />
            {selectedSprint.completedIssues}/{selectedSprint.totalIssues} ({progress}%)
          </span>
        )}

        <div className="flex-1" />
      </div>

      <CreateSprintDialog
        boardId={boardId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={defaultName}
      />
    </>
  );
}

function SprintDateEditor({
  startDate,
  endDate,
  onSave,
}: {
  startDate: string | null;
  endDate: string | null;
  onSave: (startDate: string, endDate: string) => void;
}) {
  const [start, setStart] = useState(isoToDateInput(startDate));
  const [end, setEnd] = useState(isoToDateInput(endDate));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Start Date</Label>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">End Date</Label>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => onSave(start, end)}
      >
        Save Dates
      </Button>
    </div>
  );
}
