'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  useUpdateBoard,
  useUpdateBoardColumns,
} from '@/lib/hooks/use-boards';
import { useWorkflowStatuses } from '@/lib/hooks/use-projects';
import type { Board, BoardColumn, SwimlaneBy } from '@/lib/api/boards.api';
import {
  assignStatusToColumn,
  removeStatusFromColumn,
  dropEmptyColumns,
  unassignedStatusIds,
} from './board-column-utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/shared/status-badge';
import type { WorkflowStatus } from '@repo/shared/schemas';

interface BoardSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  board: Board;
}

const SWIMLANE_OPTIONS: { value: SwimlaneBy; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'ASSIGNEE', label: 'Assignee' },
  { value: 'PRIORITY', label: 'Priority' },
  { value: 'TYPE', label: 'Type' },
];

interface SortableColumnRowProps {
  col: BoardColumn;
  index: number;
  workflowStatuses: WorkflowStatus[];
  onToggleStatus: (columnId: string, statusId: string, checked: boolean) => void;
  onUpdateColumn: (index: number, updates: Partial<BoardColumn>) => void;
  onRemoveColumn: (index: number) => void;
}

function SortableColumnRow({
  col,
  index,
  workflowStatuses,
  onToggleStatus,
  onUpdateColumn,
  onRemoveColumn,
}: SortableColumnRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-2 rounded-md border border-border px-2 py-2"
    >
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </div>
      <Input
        value={col.name}
        onChange={(e) => onUpdateColumn(index, { name: e.target.value })}
        className="h-7 text-xs flex-1"
      />
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 text-xs gap-1" />}>
          {col.statusIds.length === 0 ? (
            <span className="text-muted-foreground">No statuses</span>
          ) : (
            <span>{col.statusIds.length} status{col.statusIds.length === 1 ? '' : 'es'}</span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search statuses…" />
            <CommandList>
              <CommandEmpty>No statuses</CommandEmpty>
              {workflowStatuses.map((status) => {
                const checked = col.statusIds.includes(status.id);
                return (
                  <CommandItem
                    key={status.id}
                    value={status.name}
                    onSelect={() => onToggleStatus(col.id, status.id, !checked)}
                    className="gap-2"
                  >
                    <Checkbox checked={checked} readOnly />
                    <StatusBadge status={{ id: status.id, name: status.name, category: status.category }} />
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex items-center gap-1">
        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">WIP</Label>
        <Input
          type="number"
          min={0}
          value={col.wipLimit ?? ''}
          onChange={(e) =>
            onUpdateColumn(index, {
              wipLimit: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="h-7 w-14 text-xs"
          placeholder="∞"
        />
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-6 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemoveColumn(index)}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

export function BoardSettingsDialog({
  open,
  onOpenChange,
  projectKey,
  board,
}: BoardSettingsDialogProps) {
  const updateBoard = useUpdateBoard(projectKey);
  const updateColumns = useUpdateBoardColumns(projectKey);
  const { data: workflowStatuses } = useWorkflowStatuses(projectKey);

  const [name, setName] = useState(board.name);
  const [swimlaneBy, setSwimlaneBy] = useState(board.swimlaneBy);
  const [autoCloseOnDone, setAutoCloseOnDone] = useState(board.autoCloseOnDone);
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addColumn() {
    const newCol: BoardColumn = {
      id: crypto.randomUUID(),
      name: 'New Column',
      statusIds: [],
      ordinal: columns.length,
    };
    setColumns([...columns, newCol]);
  }

  function toggleStatus(columnId: string, statusId: string, checked: boolean) {
    setColumns((prev) =>
      checked
        ? assignStatusToColumn(prev, columnId, statusId)
        : removeStatusFromColumn(prev, columnId, statusId),
    );
  }

  function removeColumn(index: number) {
    setColumns(columns.filter((_, i) => i !== index));
  }

  function updateColumn(index: number, updates: Partial<BoardColumn>) {
    setColumns((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, ...updates };
      return updated;
    });
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumns((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    const kept = dropEmptyColumns(columns);
    if (kept.length === 0) {
      toast.error('A board needs at least one column');
      return;
    }

    const orderedColumns = kept.map((col, i) => ({ ...col, ordinal: i }));
    try {
      // Columns persist only after the board update succeeds, so a failed board
      // save can't leave a half-applied change. Errors surface via toast.
      await updateBoard.mutateAsync({
        boardId: board.id,
        data: { name, swimlaneBy, autoCloseOnDone },
      });
      await updateColumns.mutateAsync({ boardId: board.id, columns: orderedColumns });
      onOpenChange(false);
    } catch {
      // useMutationWithToast already reported the failure; keep the dialog open.
    }
  }

  const isPending = updateBoard.isPending || updateColumns.isPending;
  const allStatusIds = (workflowStatuses ?? []).map((s) => s.id);
  const unassigned = unassignedStatusIds(columns, allStatusIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Board Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* General */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="board-name">Board Name</Label>
              <Input
                id="board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Swimlanes</Label>
              <Select
                value={swimlaneBy}
                onValueChange={(v: string | null) => {
                  if (v) setSwimlaneBy(v as SwimlaneBy);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = SWIMLANE_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'Select swimlane';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SWIMLANE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-close">Auto-close parent issues</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically resolve parent issues when all children are done
                </p>
              </div>
              <Switch
                id="auto-close"
                size="sm"
                checked={autoCloseOnDone}
                onCheckedChange={setAutoCloseOnDone}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Type:</span>
              <span className="text-xs font-medium">{board.type}</span>
            </div>
          </div>

          <Separator />

          {/* Columns */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addColumn}>
                <Plus className="size-3" />
                Add Column
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext
                items={columns.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {columns.map((col, index) => (
                    <SortableColumnRow
                      key={col.id}
                      col={col}
                      index={index}
                      workflowStatuses={workflowStatuses ?? []}
                      onToggleStatus={toggleStatus}
                      onUpdateColumn={updateColumn}
                      onRemoveColumn={removeColumn}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {unassigned.length > 0 && (() => {
              const names = (workflowStatuses ?? [])
                .filter((s) => unassigned.includes(s.id))
                .map((s) => s.name)
                .join(', ');
              return (
                <p className="text-xs text-destructive">
                  Unassigned (must be placed before saving): {names}
                </p>
              );
            })()}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending || unassigned.length > 0}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
