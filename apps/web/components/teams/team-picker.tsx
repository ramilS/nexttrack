'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users2 } from 'lucide-react';
import { useTeams } from '@/lib/hooks/use-teams';

interface TeamPickerProps {
  projectKey: string;
  value: string | null;
  onChange: (teamId: string | null) => void;
  className?: string;
}

export function TeamPicker({ projectKey, value, onChange, className }: TeamPickerProps) {
  const { data: teams } = useTeams(projectKey);

  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v: string | null) => onChange(v === '__none__' ? null : v)}
    >
      <SelectTrigger className={className ?? 'h-8 w-full text-xs'}>
        <SelectValue>
          {value && teams?.find((t) => t.id === value)
            ? teams.find((t) => t.id === value)!.name
            : <span className="text-muted-foreground">No team</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__" label="No team">
          <span className="text-muted-foreground">No team</span>
        </SelectItem>
        {teams?.map((team) => (
          <SelectItem key={team.id} value={team.id} label={team.name}>
            <Users2 className="size-3.5" />
            {team.name}
            <span className="text-muted-foreground ml-1">({team.memberCount})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
