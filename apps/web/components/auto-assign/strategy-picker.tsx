'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/shared/user-avatar';
import { TeamPicker } from '@/components/teams/team-picker';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import type { AssignStrategy } from '@/lib/api/auto-assign.api';
import { cn } from '@/lib/utils';

const STRATEGIES: { value: AssignStrategy; label: string; description: string }[] = [
  { value: 'SPECIFIC_USER', label: 'Specific User', description: 'Always assign to a specific person' },
  { value: 'ROUND_ROBIN_TEAM', label: 'Round Robin (Team)', description: 'Rotate assignments across team members' },
  { value: 'LEAST_LOADED_TEAM', label: 'Least Loaded (Team)', description: 'Assign to the team member with fewest open issues' },
  { value: 'PROJECT_LEAD', label: 'Project Lead', description: 'Assign to the project lead' },
];

interface StrategyPickerProps {
  projectKey: string;
  strategy: AssignStrategy;
  assigneeId: string | null;
  teamId: string | null;
  onStrategyChange: (strategy: AssignStrategy) => void;
  onAssigneeChange: (assigneeId: string | null) => void;
  onTeamChange: (teamId: string | null) => void;
}

export function StrategyPicker({
  projectKey,
  strategy,
  assigneeId,
  teamId,
  onStrategyChange,
  onAssigneeChange,
  onTeamChange,
}: StrategyPickerProps) {
  const { data: members } = useProjectMembers(projectKey);
  const needsUser = strategy === 'SPECIFIC_USER';
  const needsTeam = strategy === 'ROUND_ROBIN_TEAM' || strategy === 'LEAST_LOADED_TEAM';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Assignment Strategy</Label>
        <div className="grid gap-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={cn(
                'flex flex-col items-start rounded-md border px-3 py-2.5 text-left transition-colors',
                strategy === s.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent',
              )}
              onClick={() => onStrategyChange(s.value)}
            >
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.description}</span>
            </button>
          ))}
        </div>
      </div>

      {needsUser && (
        <div className="space-y-2">
          <Label className="text-xs">Assignee</Label>
          <Select
            value={assigneeId ?? ''}
            onValueChange={(v: string | null) => onAssigneeChange(v || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select user...">
                {(value: string | null) => {
                  const member = members?.find((m) => m.user.id === value);
                  return member?.user.name ?? 'Select user...';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {members?.map((m) => (
                <SelectItem key={m.user.id} value={m.user.id} label={m.user.name}>
                  <UserAvatar
                    user={m.user}
                    size="sm"
                    className="size-5"
                  />
                  {m.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsTeam && (
        <div className="space-y-2">
          <Label className="text-xs">Team</Label>
          <TeamPicker
            projectKey={projectKey}
            value={teamId}
            onChange={onTeamChange}
          />
        </div>
      )}
    </div>
  );
}
