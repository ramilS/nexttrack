'use client';

import { useState } from 'react';
import { Plus, Trash2, Users2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useTeams, useDeleteTeam } from '@/lib/hooks/use-teams';
import { TeamForm } from './team-form';
import { TeamMemberManager } from './team-member-manager';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';

interface TeamListProps {
  projectKey: string;
  className?: string;
}

export function TeamList({ projectKey, className }: TeamListProps) {
  const { data: teams, isLoading } = useTeams(projectKey);
  const deleteTeam = useDeleteTeam(projectKey);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [managingTeamId, setManagingTeamId] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {teams?.length ?? 0} team{teams?.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          New Team
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!teams || teams.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <Users2 className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No teams yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a team to organize project members.</p>
          </div>
        }
        className="py-8"
      >
        <div className="grid gap-3">
          {teams?.map((team) => (
            <Card key={team.id} className="gap-0 py-0">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 items-center justify-center rounded-md bg-accent">
                    <Users2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{team.name}</p>
                    {team.description && (
                      <p className="text-xs text-muted-foreground truncate">{team.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {team.lead && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Crown className="size-3" />
                      <span>{team.lead.name}</span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setManagingTeamId(team.id)}
                  >
                    Members
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingTeamId(team.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => setDeletingTeam({ id: team.id, name: team.name })}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>

              {/* Member avatars */}
              {team.members.length > 0 && (
                <div className="flex items-center gap-1 px-4 pb-3 border-t border-border pt-2">
                  {team.members.slice(0, 8).map((member) => (
                    <UserAvatar
                      key={member.id}
                      user={member}
                      size="sm"
                      className="size-6"
                    />
                  ))}
                  {team.members.length > 8 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      +{team.members.length - 8}
                    </span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </AsyncContent>

      <TeamForm
        projectKey={projectKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingTeamId && (
        <TeamForm
          projectKey={projectKey}
          teamId={editingTeamId}
          open={!!editingTeamId}
          onOpenChange={(open) => { if (!open) setEditingTeamId(null); }}
        />
      )}

      {managingTeamId && (
        <TeamMemberManager
          projectKey={projectKey}
          teamId={managingTeamId}
          open={!!managingTeamId}
          onOpenChange={(open) => { if (!open) setManagingTeamId(null); }}
        />
      )}

      <ConfirmDialog
        open={!!deletingTeam}
        onOpenChange={(open) => { if (!open) setDeletingTeam(null); }}
        title={`Delete team "${deletingTeam?.name}"`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingTeam) deleteTeam.mutate(deletingTeam.id);
        }}
      />
    </div>
  );
}
