'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateRole, useUpdateRole } from '@/lib/hooks/use-roles';
import { PERMISSION_GROUPS, type Permission } from '@repo/shared';
import type { Role } from '@/lib/api/roles.api';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEdit = !!role;
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const isPending = createRole.isPending || updateRole.isPending;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<Permission>>(new Set());

  useEffect(() => {
    if (open) {
      setName(role?.name ?? '');
      setDescription(role?.description ?? '');
      setSelectedPermissions(new Set(role?.permissions ?? []));
    }
  }, [open, role]);

  function togglePermission(permission: Permission) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return next;
    });
  }

  function toggleGroup(permissions: Permission[]) {
    const allSelected = permissions.every((p) => selectedPermissions.has(p));
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of permissions) {
        if (allSelected) {
          next.delete(p);
        } else {
          next.add(p);
        }
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const permissions = Array.from(selectedPermissions);

    if (isEdit && role) {
      await updateRole.mutateAsync({
        id: role.id,
        data: {
          ...(role.isSystem ? {} : { name }),
          description: description || undefined,
          permissions,
        },
      });
    } else {
      await createRole.mutateAsync({ name, description: description || undefined, permissions });
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Role' : 'Create Role'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={role?.isSystem}
              placeholder="e.g. QA Engineer"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-4">
            <Label>Permissions</Label>
            {PERMISSION_GROUPS.map((group) => {
              const allChecked = group.permissions.every((p) => selectedPermissions.has(p));
              const someChecked = group.permissions.some((p) => selectedPermissions.has(p));

              return (
                <div key={group.label} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked && !allChecked}
                      onCheckedChange={() => toggleGroup(group.permissions)}
                    />
                    <span className="text-sm font-medium">{group.label}</span>
                  </div>
                  <div className="ml-6 grid grid-cols-2 gap-y-1.5 gap-x-4">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission}
                        className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedPermissions.has(permission)}
                          onCheckedChange={() => togglePermission(permission)}
                        />
                        {formatPermissionLabel(permission)}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={(!role?.isSystem && !name.trim()) || selectedPermissions.size === 0 || isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatPermissionLabel(permission: string): string {
  return permission
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
