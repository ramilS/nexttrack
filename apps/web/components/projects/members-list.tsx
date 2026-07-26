'use client';

import { useMemo, useState } from 'react';
import { Plus, MoreVertical, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/shared/user-avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import { useRoles } from '@/lib/hooks/use-roles';
import { projectsApi } from '@/lib/api/projects.api';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '@/lib/hooks/use-projects';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AddMemberDialog } from './add-member-dialog';

const PROJECT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

interface MembersListProps {
  projectKey: string;
  className?: string;
}

export function MembersList({ projectKey, className }: MembersListProps) {
  const { data: members, isLoading } = useProjectMembers(projectKey);
  const { data: roles } = useRoles();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const filteredMembers = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return members;
    return members?.filter(
      (member) =>
        member.user.name.toLowerCase().includes(query) ||
        member.user.email.toLowerCase().includes(query),
    );
  }, [members, debouncedSearch]);

  async function handleRoleChange(userId: string, roleId: string) {
    try {
      await projectsApi.updateMember(projectKey, userId, { roleId });
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectKey) });
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  }

  async function handleRemove(userId: string) {
    try {
      await projectsApi.removeMember(projectKey, userId);
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectKey) });
      toast.success('Member removed');
    } catch {
      toast.error('Failed to remove member');
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground shrink-0">
          {filteredMembers?.length ?? 0} of {members?.length ?? 0} members
        </span>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="size-3.5" />
          Add Member
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!filteredMembers || filteredMembers.length === 0}
        emptyState={
          search
            ? <EmptyState title="No matches" description="No members match your search." />
            : <EmptyState title="No members" description="Add members to collaborate on this project." />
        }
      >
        <Card className="gap-0 py-0 overflow-hidden">
          {filteredMembers?.map((member) => {
            const isAdmin = member.role.id === PROJECT_ADMIN_ROLE_ID;

            return (
              <div
                key={member.user.id}
                className="flex items-center gap-4 border-b border-border last:border-b-0 px-5 py-3"
              >
                <UserAvatar
                  user={member.user}
                  size="sm"
                  className="size-8"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                </div>

                <Select
                  value={member.role.id}
                  onValueChange={(v: string | null) => {
                    if (v) handleRoleChange(member.user.id, v);
                  }}
                >
                  <SelectTrigger className="h-7 w-auto text-xs">
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

                {!isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-7" />}>
                      <MoreVertical className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setRemovingUserId(member.user.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </Card>
      </AsyncContent>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectKey={projectKey}
      />

      <ConfirmDialog
        open={!!removingUserId}
        onOpenChange={(open) => { if (!open) setRemovingUserId(null); }}
        title="Remove member"
        description="Remove this member from the project?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={async () => {
          if (removingUserId) await handleRemove(removingUserId);
        }}
      />
    </div>
  );
}
