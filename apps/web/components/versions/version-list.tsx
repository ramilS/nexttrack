'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Rocket,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VersionForm } from './version-form';
import {
  useVersions,
  useCreateVersion,
  useUpdateVersion,
  useReleaseVersion,
  useArchiveVersion,
  useDeleteVersion,
} from '@/lib/hooks/use-versions';
import type { Version, VersionStatus } from '@/lib/api/versions.api';
import { useCRUDManager } from '@/lib/hooks/use-crud-manager';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const STATUS_STYLES: Record<VersionStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  UNRELEASED: { label: 'Unreleased', variant: 'outline' },
  RELEASED: { label: 'Released', variant: 'default' },
  ARCHIVED: { label: 'Archived', variant: 'secondary' },
};

interface VersionListProps {
  projectKey: string;
  className?: string;
}

export function VersionList({ projectKey, className }: VersionListProps) {
  const { data: versions, isLoading } = useVersions(projectKey);
  const createVersion = useCreateVersion(projectKey);
  const updateVersion = useUpdateVersion(projectKey);
  const releaseVersion = useReleaseVersion(projectKey);
  const archiveVersion = useArchiveVersion(projectKey);
  const deleteVersion = useDeleteVersion(projectKey);

  const {
    createOpen, openCreate, closeCreate,
    editingItem: editingVersion, startEdit: setEditingVersion, stopEdit,
    deletingItem: deletingVersion, startDelete: setDeletingVersion, stopDelete,
  } = useCRUDManager<Version>();

  const grouped = useMemo(() => {
    if (!versions) return { UNRELEASED: [], RELEASED: [], ARCHIVED: [] };
    const groups: Record<VersionStatus, Version[]> = {
      UNRELEASED: [],
      RELEASED: [],
      ARCHIVED: [],
    };
    for (const v of versions) {
      groups[v.status].push(v);
    }
    return groups;
  }, [versions]);

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Versions</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          New Version
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!versions || versions.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground py-4">
            No versions yet. Create versions to plan releases.
          </p>
        }
        className="py-8"
      >
        {(['UNRELEASED', 'RELEASED', 'ARCHIVED'] as VersionStatus[]).map((status) => {
          const items = grouped[status];
          if (items.length === 0) return null;
          const { label } = STATUS_STYLES[status];

          return (
            <div key={status} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {label} ({items.length})
              </h3>
              <div className="space-y-1">
                {items.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="size-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{version.name}</span>
                          <Badge variant={STATUS_STYLES[version.status].variant} className="text-[10px] px-1.5 py-0">
                            {STATUS_STYLES[version.status].label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {version.description && (
                            <span className="text-xs text-muted-foreground truncate">
                              {version.description}
                            </span>
                          )}
                          {version.releaseDate && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(version.releaseDate), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {version.status === 'UNRELEASED' && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-success"
                          onClick={() => releaseVersion.mutate({ versionId: version.id })}
                          title="Release"
                        >
                          <Rocket className="size-3.5" />
                        </Button>
                      )}
                      {version.status === 'RELEASED' && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-7"
                          onClick={() => archiveVersion.mutate(version.id)}
                          title="Archive"
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-7"
                        onClick={() => setEditingVersion(version)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingVersion(version)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </AsyncContent>

      <VersionForm
        open={createOpen}
        onOpenChange={(open) => { if (!open) closeCreate(); }}
        onSubmit={(data) => {
          createVersion.mutate(data, { onSuccess: closeCreate });
        }}
        isPending={createVersion.isPending}
      />

      <ConfirmDialog
        open={!!deletingVersion}
        onOpenChange={(open) => { if (!open) stopDelete(); }}
        title={`Delete version "${deletingVersion?.name}"`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingVersion) deleteVersion.mutate(deletingVersion.id);
        }}
      />

      {editingVersion && (
        <VersionForm
          open
          onOpenChange={stopEdit}
          onSubmit={(data) => {
            updateVersion.mutate(
              { versionId: editingVersion.id, data },
              { onSuccess: stopEdit },
            );
          }}
          isPending={updateVersion.isPending}
          defaultValues={editingVersion}
          title="Edit Version"
        />
      )}
    </div>
  );
}
