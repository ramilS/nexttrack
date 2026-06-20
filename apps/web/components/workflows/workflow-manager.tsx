'use client';

import { Plus, Pencil, Trash2, Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { WorkflowFormDialog } from './workflow-form-dialog';
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useSetDefaultWorkflow,
} from '@/lib/hooks/use-workflows';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { useCRUDManager } from '@/lib/hooks/use-crud-manager';
import { Permission } from '@repo/shared';
import type { WorkflowDto, CreateWorkflowInput, UpdateWorkflowInput } from '@/lib/api/workflows.api';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface WorkflowManagerProps {
  projectKey: string;
  className?: string;
}

export function WorkflowManager({ projectKey, className }: WorkflowManagerProps) {
  const { data: workflows, isLoading } = useWorkflows(projectKey);
  const createWorkflow = useCreateWorkflow(projectKey);
  const updateWorkflow = useUpdateWorkflow(projectKey);
  const deleteWorkflow = useDeleteWorkflow(projectKey);
  const setDefaultWorkflow = useSetDefaultWorkflow(projectKey);

  const canManage = useHasPermission(Permission.WORKFLOW_MANAGE);
  const {
    createOpen, openCreate, closeCreate,
    editingItem: editingWorkflow, startEdit, stopEdit,
    deletingItem: deletingWorkflow, startDelete, stopDelete,
  } = useCRUDManager<WorkflowDto>();

  function handleCreate(data: {
    name: string;
    statuses: Array<{ tempId: string; id?: string; name: string; color: string; category: string; isInitial: boolean; isResolved: boolean }>;
    transitions: Array<{ tempId: string; id?: string; name: string; fromStatusId: string; toStatusId: string }>;
  }) {
    const payload: CreateWorkflowInput = {
      name: data.name,
      statuses: data.statuses.map((s, i) => ({
        name: s.name,
        color: s.color,
        category: s.category as 'UNSTARTED' | 'STARTED' | 'DONE',
        isInitial: s.isInitial,
        isResolved: s.isResolved,
        ordinal: i,
      })),
      transitions: data.transitions
        .filter((t) => t.name.trim() && t.toStatusId)
        .map((t) => ({
          name: t.name,
          fromStatusId: resolveStatusId(t.fromStatusId, data.statuses),
          toStatusId: resolveStatusId(t.toStatusId, data.statuses),
          requiredRole: null,
        })),
    };
    createWorkflow.mutate(payload, { onSuccess: closeCreate });
  }

  function handleUpdate(data: {
    name: string;
    statuses: Array<{ tempId: string; id?: string; name: string; color: string; category: string; isInitial: boolean; isResolved: boolean }>;
    transitions: Array<{ tempId: string; id?: string; name: string; fromStatusId: string; toStatusId: string }>;
  }) {
    if (!editingWorkflow) return;
    const payload: UpdateWorkflowInput = {
      name: data.name,
      statuses: data.statuses.map((s, i) => ({
        id: s.id ?? crypto.randomUUID(),
        name: s.name,
        color: s.color,
        category: s.category as 'UNSTARTED' | 'STARTED' | 'DONE',
        isInitial: s.isInitial,
        isResolved: s.isResolved,
        ordinal: i,
      })),
      transitions: data.transitions
        .filter((t) => t.name.trim() && t.toStatusId)
        .map((t) => ({
          id: t.id ?? crypto.randomUUID(),
          name: t.name,
          fromStatusId: resolveStatusId(t.fromStatusId, data.statuses),
          toStatusId: resolveStatusId(t.toStatusId, data.statuses),
          requiredRole: null,
        })),
    };
    updateWorkflow.mutate(
      { id: editingWorkflow.id, data: payload },
      { onSuccess: stopEdit },
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workflows</h2>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New Workflow
          </Button>
        )}
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!workflows || workflows.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground py-4">
            No workflows yet. Create your first workflow to define issue statuses.
          </p>
        }
        className="py-8"
      >
        <div className="space-y-3">
          {workflows?.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              canManage={canManage}
              onEdit={() => startEdit(workflow)}
              onDelete={() => startDelete(workflow)}
              onSetDefault={() => setDefaultWorkflow.mutate(workflow.id)}
              isSettingDefault={setDefaultWorkflow.isPending}
            />
          ))}
        </div>
      </AsyncContent>

      <WorkflowFormDialog
        open={createOpen}
        onOpenChange={(open) => { if (!open) closeCreate(); }}
        onSubmit={handleCreate}
        isPending={createWorkflow.isPending}
      />

      <ConfirmDialog
        open={!!deletingWorkflow}
        onOpenChange={(open) => { if (!open) stopDelete(); }}
        title={`Delete workflow "${deletingWorkflow?.name}"`}
        description="This workflow and its configuration will be permanently removed. Issues using this workflow will not be affected."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deletingWorkflow) deleteWorkflow.mutate(deletingWorkflow.id); }}
      />

      {editingWorkflow && (
        <WorkflowFormDialog
          open
          onOpenChange={stopEdit}
          onSubmit={handleUpdate}
          isPending={updateWorkflow.isPending}
          defaultValues={{
            name: editingWorkflow.name,
            statuses: editingWorkflow.statuses,
            transitions: editingWorkflow.transitions,
          }}
          title="Edit Workflow"
        />
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
  canManage,
  onEdit,
  onDelete,
  onSetDefault,
  isSettingDefault,
}: {
  workflow: WorkflowDto;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isSettingDefault: boolean;
}) {
  const sortedStatuses = [...workflow.statuses].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-medium">{workflow.name}</h3>
          {workflow.isDefault && (
            <Badge variant="secondary" className="text-xs">
              <Star className="size-3" />
              Default
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {workflow.statuses.length} statuses · {workflow.transitions.length} transitions
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            {!workflow.isDefault && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onSetDefault}
                disabled={isSettingDefault}
              >
                Set as default
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-7"
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            {!workflow.isDefault && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {sortedStatuses.map((status, i) => (
            <span key={status.id} className="flex items-center gap-1.5">
              <StatusBadge status={status} />
              {i < sortedStatuses.length - 1 && (
                <ArrowRight className="size-3 text-muted-foreground" />
              )}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function resolveStatusId(
  id: string,
  statuses: Array<{ tempId: string; id?: string }>,
): string {
  if (id === '*') return '*';
  const status = statuses.find((s) => (s.id ?? s.tempId) === id);
  return status?.id ?? id;
}
