'use client';

import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { ConditionBuilder } from './condition-builder';
import { StrategyPicker } from './strategy-picker';
import { useCreateAutoAssignRule } from '@/lib/hooks/use-auto-assign';
import type { RuleConditions, AssignStrategy } from '@/lib/api/auto-assign.api';

interface RuleFormProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleForm({ projectKey, open, onOpenChange }: RuleFormProps) {
  const createRule = useCreateAutoAssignRule(projectKey);
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RuleConditions>({});
  const [strategy, setStrategy] = useState<AssignStrategy>('PROJECT_LEAD');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setConditions({});
    setStrategy('PROJECT_LEAD');
    setAssigneeId(null);
    setTeamId(null);
  }

  function handleSubmit() {
    if (!name.trim()) return;

    createRule.mutate(
      {
        name: name.trim(),
        conditions,
        strategy,
        assigneeId: assigneeId ?? undefined,
        teamId: teamId ?? undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Auto-assign Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              placeholder="e.g., Assign bugs to QA team"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-3">Conditions</p>
            <ConditionBuilder
              projectKey={projectKey}
              conditions={conditions}
              onChange={setConditions}
            />
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-3">Assignment</p>
            <StrategyPicker
              projectKey={projectKey}
              strategy={strategy}
              assigneeId={assigneeId}
              teamId={teamId}
              onStrategyChange={setStrategy}
              onAssigneeChange={setAssigneeId}
              onTeamChange={setTeamId}
            />
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
          <Button onClick={handleSubmit} disabled={!name.trim() || createRule.isPending}>
            {createRule.isPending && <Loader2 className="size-4 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
