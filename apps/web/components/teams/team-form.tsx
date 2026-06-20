'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Loader2 } from 'lucide-react';
import { useTeam, useCreateTeam, useUpdateTeam } from '@/lib/hooks/use-teams';
import { useProjectMembers } from '@/lib/hooks/use-projects';

interface TeamFormProps {
  projectKey: string;
  teamId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamForm({ projectKey, teamId, open, onOpenChange }: TeamFormProps) {
  const isEdit = !!teamId;
  const { data: team } = useTeam(projectKey, teamId ?? '', );
  const { data: members } = useProjectMembers(projectKey);
  const createTeam = useCreateTeam(projectKey);
  const updateTeam = useUpdateTeam(projectKey);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && team) {
      setName(team.name);
      setDescription(team.description ?? '');
      setLeadId(team.lead?.id ?? null);
    }
  }, [isEdit, team]);

  function resetForm() {
    setName('');
    setDescription('');
    setLeadId(null);
  }

  function handleSubmit() {
    if (!name.trim()) return;

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      leadId: leadId ?? undefined,
    };

    if (isEdit && teamId) {
      updateTeam.mutate(
        { teamId, data },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        },
      );
    } else {
      createTeam.mutate(data, {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      });
    }
  }

  const isPending = createTeam.isPending || updateTeam.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Team' : 'Create Team'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              placeholder="Team name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              placeholder="What does this team do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Team Lead</Label>
            <Select
              value={leadId ?? ''}
              onValueChange={(v: string | null) => setLeadId(v || null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a lead...">
                  {(value: string | null) => {
                    const member = members?.find((m) => m.user.id === value);
                    return member?.user.name ?? 'Select a lead...';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.user.id} value={member.user.id} label={member.user.name}>
                    <UserAvatar
                      user={member.user}
                      size="sm"
                      className="size-5"
                    />
                    {member.user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
