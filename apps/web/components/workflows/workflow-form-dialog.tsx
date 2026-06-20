'use client';

import { useState, useCallback } from 'react';
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
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorPicker } from '@/components/shared/color-picker';
import { COLOR_PRESETS } from '@/lib/constants/color-presets';
import type {
  WorkflowStatusData,
  WorkflowTransitionData,
} from '@/lib/api/workflows.api';
import type { StatusCategory } from '@repo/shared/schemas';

const CATEGORY_OPTIONS: { value: StatusCategory; label: string }[] = [
  { value: 'UNSTARTED', label: 'Unstarted' },
  { value: 'STARTED', label: 'Started' },
  { value: 'DONE', label: 'Done' },
];

export interface StatusFormData {
  tempId: string;
  id?: string;
  name: string;
  color: string;
  category: StatusCategory;
  isInitial: boolean;
  isResolved: boolean;
}

export interface TransitionFormData {
  tempId: string;
  id?: string;
  name: string;
  fromStatusId: string;
  toStatusId: string;
}

interface WorkflowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    statuses: StatusFormData[];
    transitions: TransitionFormData[];
  }) => void;
  isPending?: boolean;
  defaultValues?: {
    name: string;
    statuses: WorkflowStatusData[];
    transitions: WorkflowTransitionData[];
  };
  title?: string;
}

let nextTempId = 0;
function genTempId() {
  return `temp-${++nextTempId}`;
}

function createEmptyStatus(ordinal: number): StatusFormData {
  return {
    tempId: genTempId(),
    name: '',
    color: COLOR_PRESETS[ordinal % COLOR_PRESETS.length]!,
    category: 'STARTED',
    isInitial: false,
    isResolved: false,
  };
}

function getStatusKey(s: StatusFormData) {
  return s.id ?? s.tempId;
}

function hasTransitionSelfLoop(t: TransitionFormData): boolean {
  return t.fromStatusId !== '*' && t.fromStatusId === t.toStatusId;
}

function hasTransitionMissingTarget(t: TransitionFormData): boolean {
  return !t.toStatusId;
}

export function WorkflowFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Create Workflow',
}: WorkflowFormDialogProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');

  const [statuses, setStatuses] = useState<StatusFormData[]>(() => {
    if (defaultValues?.statuses.length) {
      return [...defaultValues.statuses]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((s) => ({
          tempId: genTempId(),
          id: s.id,
          name: s.name,
          color: s.color,
          category: s.category,
          isInitial: s.isInitial,
          isResolved: s.isResolved,
        }));
    }
    return [
      { tempId: genTempId(), name: 'Open', color: '#6b7280', category: 'UNSTARTED' as StatusCategory, isInitial: true, isResolved: false },
      { tempId: genTempId(), name: 'In Progress', color: '#3b82f6', category: 'STARTED' as StatusCategory, isInitial: false, isResolved: false },
      { tempId: genTempId(), name: 'Done', color: '#22c55e', category: 'DONE' as StatusCategory, isInitial: false, isResolved: true },
    ];
  });

  const [transitions, setTransitions] = useState<TransitionFormData[]>(() => {
    if (defaultValues?.transitions.length) {
      return defaultValues.transitions.map((t) => ({
        tempId: genTempId(),
        id: t.id,
        name: t.name,
        fromStatusId: t.fromStatusId,
        toStatusId: t.toStatusId,
      }));
    }
    return [];
  });

  const updateStatus = useCallback((targetTempId: string, patch: Partial<StatusFormData>) => {
    setStatuses((prev) => prev.map((s) => (s.tempId === targetTempId ? { ...s, ...patch } : s)));
  }, []);

  const setInitialStatus = useCallback((targetTempId: string) => {
    setStatuses((prev) =>
      prev.map((s) => ({ ...s, isInitial: s.tempId === targetTempId })),
    );
  }, []);

  const removeStatus = useCallback((targetTempId: string) => {
    setStatuses((prev) => {
      const removed = prev.find((s) => s.tempId === targetTempId);
      const removedKey = removed ? getStatusKey(removed) : null;
      if (removedKey) {
        setTransitions((ts) =>
          ts.filter((t) => t.fromStatusId !== removedKey && t.toStatusId !== removedKey),
        );
      }
      return prev.filter((s) => s.tempId !== targetTempId);
    });
  }, []);

  const handleStatusDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStatuses((prev) => {
      const oldIndex = prev.findIndex((s) => s.tempId === active.id);
      const newIndex = prev.findIndex((s) => s.tempId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const addTransition = useCallback(() => {
    setTransitions((prev) => [
      ...prev,
      { tempId: genTempId(), name: '', fromStatusId: '*', toStatusId: '' },
    ]);
  }, []);

  const updateTransition = useCallback((targetTempId: string, patch: Partial<TransitionFormData>) => {
    setTransitions((prev) => prev.map((t) => (t.tempId === targetTempId ? { ...t, ...patch } : t)));
  }, []);

  const removeTransition = useCallback((targetTempId: string) => {
    setTransitions((prev) => prev.filter((t) => t.tempId !== targetTempId));
  }, []);

  const hasInitial = statuses.some((s) => s.isInitial);
  const hasStatuses = statuses.length > 0;
  const allStatusesNamed = statuses.every((s) => s.name.trim());
  const hasInvalidTransitions = transitions.some(
    (t) => hasTransitionSelfLoop(t) || hasTransitionMissingTarget(t),
  );
  const isValid = name.trim() && hasStatuses && hasInitial && allStatusesNamed && !hasInvalidTransitions;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ name: name.trim(), statuses, transitions });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name..."
              autoFocus
            />
          </div>

          <StatusesSection
            statuses={statuses}
            onAdd={() => setStatuses((prev) => [...prev, createEmptyStatus(prev.length)])}
            onUpdate={updateStatus}
            onSetInitial={setInitialStatus}
            onRemove={removeStatus}
            onDragEnd={handleStatusDragEnd}
          />

          <TransitionsSection
            statuses={statuses}
            transitions={transitions}
            onAdd={addTransition}
            onUpdate={updateTransition}
            onRemove={removeTransition}
            getStatusKey={getStatusKey}
          />

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {defaultValues ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableStatusRow({
  status,
  onUpdate,
  onSetInitial,
  onRemove,
}: {
  status: StatusFormData;
  onUpdate: (tempId: string, patch: Partial<StatusFormData>) => void;
  onSetInitial: (tempId: string) => void;
  onRemove: (tempId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.tempId });

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
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
    >
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </div>

      <ColorPicker
        value={status.color}
        onChange={(hex) => onUpdate(status.tempId, { color: hex })}
        aria-label="Status color"
        className="shrink-0"
      />

      <Input
        value={status.name}
        onChange={(e) => onUpdate(status.tempId, { name: e.target.value })}
        placeholder="Status name..."
        className="flex-1 h-7 text-sm"
      />

      <Select
        items={CATEGORY_OPTIONS}
        value={status.category}
        onValueChange={(val) => {
          const category = val as StatusCategory;
          const patch: Partial<StatusFormData> = { category };
          if (category === 'DONE') patch.isResolved = true;
          if (category !== 'DONE') patch.isResolved = false;
          onUpdate(status.tempId, patch);
        }}
      >
        <SelectTrigger size="sm" className="w-28 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={() => onSetInitial(status.tempId)}
        className={cn(
          'shrink-0 rounded-full border-2 size-5 transition-colors',
          status.isInitial
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/30 hover:border-muted-foreground/60',
        )}
        title="Set as initial status"
      >
        {status.isInitial && (
          <span className="block size-2 mx-auto rounded-full bg-primary-foreground" />
        )}
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-6 text-destructive hover:text-destructive shrink-0"
        onClick={() => onRemove(status.tempId)}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

function StatusesSection({
  statuses,
  onAdd,
  onUpdate,
  onSetInitial,
  onRemove,
  onDragEnd,
}: {
  statuses: StatusFormData[];
  onAdd: () => void;
  onUpdate: (tempId: string, patch: Partial<StatusFormData>) => void;
  onSetInitial: (tempId: string) => void;
  onRemove: (tempId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Statuses</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" />
          Add Status
        </Button>
      </div>

      {statuses.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          Add at least one status to the workflow.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={statuses.map((s) => s.tempId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {statuses.map((status) => (
              <SortableStatusRow
                key={status.tempId}
                status={status}
                onUpdate={onUpdate}
                onSetInitial={onSetInitial}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {statuses.length > 0 && !statuses.some((s) => s.isInitial) && (
        <p className="text-xs text-destructive">
          One status must be marked as initial (click the radio button).
        </p>
      )}
    </div>
  );
}

function TransitionsSection({
  statuses,
  transitions,
  onAdd,
  onUpdate,
  onRemove,
  getStatusKey: getKey,
}: {
  statuses: StatusFormData[];
  transitions: TransitionFormData[];
  onAdd: () => void;
  onUpdate: (tempId: string, patch: Partial<TransitionFormData>) => void;
  onRemove: (tempId: string) => void;
  getStatusKey: (s: StatusFormData) => string;
}) {
  const statusOptions = statuses
    .filter((s) => s.name.trim())
    .map((s) => ({ value: getKey(s), label: s.name, color: s.color }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Transitions</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define allowed status changes. Leave empty to allow all transitions.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-3.5" />
          Add Transition
        </Button>
      </div>

      {transitions.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No transitions defined. All status changes will be allowed.
        </p>
      )}

      <div className="space-y-2">
        {transitions.map((transition) => {
          const isSelfLoop = hasTransitionSelfLoop(transition);
          const isMissingTarget = hasTransitionMissingTarget(transition);
          const hasError = isSelfLoop || isMissingTarget;

          return (
            <div key={transition.tempId} className="space-y-1">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  hasError ? 'border-destructive/50' : 'border-border',
                )}
              >
                <Input
                  value={transition.name}
                  onChange={(e) => onUpdate(transition.tempId, { name: e.target.value })}
                  placeholder="Transition name..."
                  className="flex-1 h-7 text-sm"
                />

                <Select
                  items={[{ value: '*', label: 'Any status' }, ...statusOptions]}
                  value={transition.fromStatusId}
                  onValueChange={(val) => onUpdate(transition.tempId, { fromStatusId: val as string })}
                >
                  <SelectTrigger size="sm" className="w-36 shrink-0">
                    <SelectValue placeholder="From..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*" label="Any status">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-muted-foreground" />
                        Any status
                      </span>
                    </SelectItem>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground shrink-0">→</span>

                <Select
                  items={statusOptions}
                  value={transition.toStatusId}
                  onValueChange={(val) => onUpdate(transition.tempId, { toStatusId: val as string })}
                >
                  <SelectTrigger size="sm" className="w-36 shrink-0">
                    <SelectValue placeholder="To..." />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 text-destructive hover:text-destructive shrink-0"
                  onClick={() => onRemove(transition.tempId)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>

              {isSelfLoop && (
                <p className="flex items-center gap-1 text-xs text-destructive pl-1">
                  <AlertCircle className="size-3 shrink-0" />
                  Source and target status must be different.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
