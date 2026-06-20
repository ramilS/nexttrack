'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useRoles, useDeleteRole } from '@/lib/hooks/use-roles';
import { RoleFormDialog } from './role-form';
import type { Role } from '@/lib/api/roles.api';

export function RoleList() {
  const { data: roles, isLoading } = useRoles();
  const deleteRole = useDeleteRole();
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {roles?.length ?? 0} roles
        </span>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          Create Custom Role
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!roles || roles.length === 0}
        emptyState={<EmptyState title="No roles" description="Create a custom role to get started." />}
      >
        <div className="grid gap-3">
          {roles?.map((role) => (
            <Card key={role.id} className="flex-row items-center gap-4 px-5 py-4">
              <Shield className="size-5 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{role.name}</p>
                  {role.isSystem && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      System
                    </Badge>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {role.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7"
                  onClick={() => setEditRole(role)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                {!role.isSystem && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-destructive"
                    onClick={() => setDeletingRole(role)}
                    disabled={deleteRole.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </AsyncContent>

      <RoleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        role={null}
      />

      {editRole && (
        <RoleFormDialog
          open={!!editRole}
          onOpenChange={(open) => {
            if (!open) setEditRole(null);
          }}
          role={editRole}
        />
      )}

      <ConfirmDialog
        open={!!deletingRole}
        onOpenChange={(open) => { if (!open) setDeletingRole(null); }}
        title={`Delete role "${deletingRole?.name}"`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingRole) deleteRole.mutate(deletingRole.id);
        }}
      />
    </div>
  );
}
