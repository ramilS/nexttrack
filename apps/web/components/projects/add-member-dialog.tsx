'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { UserAvatar } from '@/components/shared/user-avatar';
import { projectsApi } from '@/lib/api/projects.api';
import { useRoles } from '@/lib/hooks/use-roles';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '@/lib/hooks/use-projects';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DEFAULT_DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
}

function useAddableUsers(projectKey: string, query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['project-addable-users', projectKey, query],
    queryFn: () => projectsApi.searchAddableUsers(projectKey, query).then((r) => r.data),
    enabled: enabled && !!projectKey,
    staleTime: 5_000,
  });
}

export function AddMemberDialog({ open, onOpenChange, projectKey }: AddMemberDialogProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(DEFAULT_DEVELOPER_ROLE_ID);
  const [loading, setLoading] = useState(false);
  const { data: roles } = useRoles();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users, isLoading: usersLoading } = useAddableUsers(
    projectKey,
    debouncedSearch,
    open,
  );

  function handleClose() {
    setSearch('');
    setDebouncedSearch('');
    setSelectedUserId(null);
    setRoleId(DEFAULT_DEVELOPER_ROLE_ID);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;

    setLoading(true);
    try {
      await projectsApi.addMember(projectKey, { userId: selectedUserId, roleId });
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectKey) });
      toast.success('Member added');
      handleClose();
    } catch {
      toast.error('Failed to add member');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-search">User</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="member-search"
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedUserId(null);
                }}
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-input">
              {usersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : !users || users.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No users found
                </div>
              ) : (
                users.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent transition-colors',
                      selectedUserId === user.id && 'bg-accent',
                    )}
                  >
                    <UserAvatar user={user} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{user.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                    {selectedUserId === user.id && <Check className="size-3.5 text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={(v: string | null) => { if (v) setRoleId(v); }}>
              <SelectTrigger>
                <SelectValue>
                  {(value: string | null) => {
                    const r = roles?.find((role) => role.id === value);
                    return r?.name ?? 'Select role...';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id} label={role.name}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedUserId || loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
