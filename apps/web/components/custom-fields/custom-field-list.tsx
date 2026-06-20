'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CustomFieldForm } from './custom-field-form';
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
} from '@/lib/hooks/use-custom-fields';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import type { CustomField, CustomFieldType } from '@/lib/api/custom-fields.api';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  DATETIME: 'Date & Time',
  ENUM: 'Single Select',
  MULTI_ENUM: 'Multi Select',
  USER: 'User',
  MULTI_USER: 'Multi User',
  VERSION: 'Version',
  MULTI_VERSION: 'Multi Version',
  PERIOD: 'Period',
  URL: 'URL',
};

interface CustomFieldListProps {
  projectKey: string;
  className?: string;
}

export function CustomFieldList({ projectKey, className }: CustomFieldListProps) {
  const { data: fields, isLoading } = useCustomFields(projectKey);
  const createField = useCreateCustomField(projectKey);
  const updateField = useUpdateCustomField(projectKey);
  const deleteField = useDeleteCustomField(projectKey);

  const canManage = useHasPermission(Permission.CUSTOM_FIELD_MANAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [deletingField, setDeletingField] = useState<CustomField | null>(null);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Custom Fields</h2>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New Field
          </Button>
        )}
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!fields || fields.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground py-4">
            No custom fields yet. Create fields to track additional data on issues.
          </p>
        }
        className="py-8"
      >
        <div className="space-y-1">
          {fields?.map((field) => (
            <div
              key={field.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{field.name}</span>
                    {field.isRequired && (
                      <span className="text-[10px] text-destructive font-medium">Required</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {TYPE_LABELS[field.type]}
                    </Badge>
                    {field.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {field.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7"
                    onClick={() => setEditingField(field)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setDeletingField(field)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </AsyncContent>

      <CustomFieldForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          createField.mutate(data, { onSuccess: () => setCreateOpen(false) });
        }}
        isPending={createField.isPending}
      />

      {editingField && (
        <CustomFieldForm
          open
          onOpenChange={() => setEditingField(null)}
          onSubmit={(data) => {
            updateField.mutate(
              { fieldId: editingField.id, data },
              { onSuccess: () => setEditingField(null) },
            );
          }}
          isPending={updateField.isPending}
          defaultValues={editingField}
          title="Edit Custom Field"
        />
      )}

      <ConfirmDialog
        open={!!deletingField}
        onOpenChange={(open) => { if (!open) setDeletingField(null); }}
        title={`Delete custom field "${deletingField?.name}"`}
        description="Values on existing issues will be lost."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingField) deleteField.mutate(deletingField.id);
        }}
      />
    </div>
  );
}
