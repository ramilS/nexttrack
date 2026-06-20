'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Loader2, Plus, X } from 'lucide-react';
import { useTeam, useAddTeamMembers, useRemoveTeamMember } from '@/lib/hooks/use-teams';
import { useProjectMembers } from '@/lib/hooks/use-projects';

interface TeamMemberManagerProps {
  projectKey: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamMemberManager({ projectKey, teamId, open, onOpenChange }: TeamMemberManagerProps) {
  const { data: team, isLoading } = useTeam(projectKey, teamId);
  const { data: projectMembers } = useProjectMembers(projectKey);
  const addMembers = useAddTeamMembers(projectKey);
  const removeMember = useRemoveTeamMember(projectKey);
  const [search, setSearch] = useState('');

  const teamMemberIds = new Set(team?.members.map((m) => m.id) ?? []);
  const availableMembers = (projectMembers ?? []).filter(
    (pm) =>
      !teamMemberIds.has(pm.user.id) &&
      pm.user.name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleAdd(userId: string) {
    addMembers.mutate({ teamId, userIds: [userId] });
  }

  function handleRemove(userId: string) {
    removeMember.mutate({ teamId, userId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Members — {team?.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current members */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Current Members ({team?.members.length ?? 0})
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {team?.members.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                    No members yet
                  </p>
                ) : (
                  team?.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          user={member}
                          size="sm"
                          className="size-6"
                        />
                        <span className="text-sm">{member.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(member.id)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add members */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Add Members
              </p>
              <Input
                placeholder="Search project members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {availableMembers.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                    {search ? 'No matching members' : 'All members added'}
                  </p>
                ) : (
                  availableMembers.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          user={member.user}
                          size="sm"
                          className="size-6"
                        />
                        <span className="text-sm">{member.user.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6"
                        onClick={() => handleAdd(member.user.id)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
