'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TriggerPicker } from './trigger-picker';
import { ConditionNodeEditor } from './condition-node';
import { ActionEditor } from './action-editor';
import {
  useCreateWorkflowRule,
  useUpdateWorkflowRule,
} from '@/lib/hooks/use-workflow-rules';
import { useWorkflows } from '@/lib/hooks/use-workflows';
import type {
  WorkflowRule,
  WorkflowTrigger,
  WorkflowCondition,
  WorkflowAction,
} from '@/lib/api/workflow-rules.api';

interface RuleFormDialogProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRule?: WorkflowRule;
}

const DEFAULT_CONDITIONS: WorkflowCondition = { and: [] };

export function RuleFormDialog({
  projectKey,
  open,
  onOpenChange,
  editRule,
}: RuleFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<WorkflowTrigger>('ON_CREATE');
  const [workflowId, setWorkflowId] = useState('');
  const [conditions, setConditions] = useState<WorkflowCondition>(DEFAULT_CONDITIONS);
  const [actions, setActions] = useState<WorkflowAction[]>([]);

  const { data: workflows } = useWorkflows(projectKey);
  const createRule = useCreateWorkflowRule(projectKey);
  const updateRule = useUpdateWorkflowRule(projectKey);

  const isEditing = !!editRule;
  const isPending = createRule.isPending || updateRule.isPending;

  useEffect(() => {
    if (editRule) {
      setName(editRule.name);
      setDescription(editRule.description ?? '');
      setTrigger(editRule.trigger);
      setWorkflowId(editRule.workflowId);
      setConditions(editRule.conditions ?? DEFAULT_CONDITIONS);
      setActions(editRule.actions ?? []);
    } else {
      setName('');
      setDescription('');
      setTrigger('ON_CREATE');
      setWorkflowId(workflows?.[0]?.id ?? '');
      setConditions(DEFAULT_CONDITIONS);
      setActions([]);
    }
  }, [editRule, open, workflows]);

  const handleSubmit = () => {
    const baseFields = {
      name,
      description: description || undefined,
      trigger,
      conditions,
      actions,
    };

    if (isEditing) {
      updateRule.mutate(
        { ruleId: editRule.id, data: baseFields },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createRule.mutate(
        { ...baseFields, workflowId },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  const canSubmit =
    name.trim() && actions.length > 0 && (isEditing || workflowId) && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Automation Rule' : 'Create Automation Rule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Rule name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description"
                className="min-h-15"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {!isEditing && (
              <div className="space-y-2">
                <Label>Workflow</Label>
                <Select
                  value={workflowId}
                  onValueChange={(val) => {
                    if (val) setWorkflowId(val);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue>
                      {(value: string | null) => {
                        const wf = workflows?.find((w) => w.id === value);
                        return wf?.name ?? 'Select workflow';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {workflows?.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id} label={wf.name}>
                        {wf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">When (trigger)</h3>
            <TriggerPicker
              trigger={trigger}
              triggerConfig={null}
              onTriggerChange={setTrigger}
              onConfigChange={() => {}}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">If (conditions)</h3>
            <p className="text-xs text-muted-foreground">
              Optional. Leave empty to run on every trigger.
            </p>
            <ConditionNodeEditor
              node={conditions}
              onChange={setConditions}
              onRemove={() => setConditions(DEFAULT_CONDITIONS)}
              depth={0}
              projectKey={projectKey}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Then (actions)</h3>
            <ActionEditor actions={actions} onChange={setActions} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
