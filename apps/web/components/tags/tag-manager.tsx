'use client';

import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TagBadge } from '@/components/shared/tag-badge';
import { TagForm } from './tag-form';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/lib/hooks/use-tags';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { useCRUDManager } from '@/lib/hooks/use-crud-manager';
import { Permission } from '@repo/shared';
import type { Tag } from '@/lib/api/tags.api';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface TagManagerProps {
  projectKey: string;
  className?: string;
}

export function TagManager({ projectKey, className }: TagManagerProps) {
  const { data: tags, isLoading } = useTags(projectKey);
  const createTag = useCreateTag(projectKey);
  const updateTag = useUpdateTag(projectKey);
  const deleteTag = useDeleteTag(projectKey);

  const canManage = useHasPermission(Permission.TAG_MANAGE);
  const {
    createOpen, openCreate, closeCreate,
    editingItem: editingTag, startEdit: setEditingTag, stopEdit,
    deletingItem: deletingTag, startDelete: setDeletingTag, stopDelete,
  } = useCRUDManager<Tag>();

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tags</h2>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New Tag
          </Button>
        )}
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!tags || tags.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground py-4">
            No tags yet. Create your first tag to organize issues.
          </p>
        }
        className="py-8"
      >
        <div className="space-y-1">
          {tags?.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <TagBadge name={tag.name} color={tag.color} />
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7"
                    onClick={() => setEditingTag(tag)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setDeletingTag(tag)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </AsyncContent>

      <TagForm
        open={createOpen}
        onOpenChange={(open) => { if (!open) closeCreate(); }}
        onSubmit={(data) => {
          createTag.mutate(data, { onSuccess: closeCreate });
        }}
        isPending={createTag.isPending}
      />

      <ConfirmDialog
        open={!!deletingTag}
        onOpenChange={(open) => { if (!open) stopDelete(); }}
        title={`Delete tag "${deletingTag?.name}"`}
        description="It will be removed from all issues."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deletingTag) deleteTag.mutate(deletingTag.id); }}
      />

      {editingTag && (
        <TagForm
          open
          onOpenChange={stopEdit}
          onSubmit={(data) => {
            updateTag.mutate(
              { tagId: editingTag.id, data },
              { onSuccess: stopEdit },
            );
          }}
          isPending={updateTag.isPending}
          defaultValues={{ name: editingTag.name, color: editingTag.color }}
          title="Edit Tag"
        />
      )}
    </div>
  );
}
