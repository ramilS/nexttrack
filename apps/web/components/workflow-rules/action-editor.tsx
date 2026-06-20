'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Plus, X, GripVertical } from 'lucide-react';
import { ISSUE_PRIORITY_OPTIONS, ISSUE_TYPE_OPTIONS } from '@repo/shared';
import {
  ACTION_TYPES,
  type ActionType,
  type WorkflowAction,
  type IssuePriority,
  type IssueType,
} from '@repo/shared/schemas';

interface ActionEditorProps {
  actions: WorkflowAction[];
  onChange: (actions: WorkflowAction[]) => void;
}

const ACTION_LABELS: Record<ActionType, string> = {
  SET_STATUS: 'Set Status',
  SET_ASSIGNEE: 'Set Assignee',
  SET_PRIORITY: 'Set Priority',
  SET_TYPE: 'Set Type',
  ADD_TAG: 'Add Tag',
  REMOVE_TAG: 'Remove Tag',
  ADD_COMMENT: 'Add Comment',
  MOVE_TO_SPRINT: 'Move to Sprint',
  SET_DUE_DATE: 'Set Due Date',
  BLOCK_TRANSITION: 'Block Transition',
};

function buildDefaultAction(type: ActionType): WorkflowAction {
  switch (type) {
    case 'SET_STATUS':
      return { type, statusId: '' };
    case 'SET_ASSIGNEE':
      return { type, userId: '' };
    case 'SET_PRIORITY':
      return { type, priority: 'MEDIUM' };
    case 'SET_TYPE':
      return { type, issueType: 'TASK' };
    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return { type, tagId: '' };
    case 'ADD_COMMENT':
      return { type, body: '' };
    case 'MOVE_TO_SPRINT':
      return { type, sprintId: '' };
    case 'SET_DUE_DATE':
      return { type, offsetDays: 0 };
    case 'BLOCK_TRANSITION':
      return { type, message: '' };
  }
}

function ActionParamEditor({
  action,
  onChange,
}: {
  action: WorkflowAction;
  onChange: (action: WorkflowAction) => void;
}) {
  switch (action.type) {
    case 'SET_STATUS':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Status ID</Label>
          <Input
            className="h-8 text-sm"
            placeholder="UUID"
            value={action.statusId}
            onChange={(e) => onChange({ ...action, statusId: e.target.value })}
          />
        </div>
      );

    case 'SET_ASSIGNEE':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Assignee user ID</Label>
          <Input
            className="h-8 text-sm"
            placeholder="UUID or $TRIGGER_USER"
            value={action.userId}
            onChange={(e) => onChange({ ...action, userId: e.target.value })}
          />
        </div>
      );

    case 'SET_PRIORITY':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select
            value={action.priority}
            onValueChange={(val) => {
              if (val) onChange({ ...action, priority: val as IssuePriority });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>
                {(value: string | null) =>
                  ISSUE_PRIORITY_OPTIONS.find((p) => p.value === value)?.label ?? 'Select priority'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ISSUE_PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value} label={p.label}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'SET_TYPE':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={action.issueType}
            onValueChange={(val) => {
              if (val) onChange({ ...action, issueType: val as IssueType });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>
                {(value: string | null) =>
                  ISSUE_TYPE_OPTIONS.find((t) => t.value === value)?.label ?? 'Select type'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ISSUE_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value} label={t.label}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Tag ID</Label>
          <Input
            className="h-8 text-sm"
            placeholder="UUID"
            value={action.tagId}
            onChange={(e) => onChange({ ...action, tagId: e.target.value })}
          />
        </div>
      );

    case 'ADD_COMMENT':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Comment body</Label>
          <Textarea
            className="min-h-15 text-sm"
            placeholder="Enter comment text"
            value={action.body}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
          />
        </div>
      );

    case 'MOVE_TO_SPRINT':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Sprint ID</Label>
          <Input
            className="h-8 text-sm"
            placeholder="UUID"
            value={action.sprintId}
            onChange={(e) => onChange({ ...action, sprintId: e.target.value })}
          />
        </div>
      );

    case 'SET_DUE_DATE':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Offset days from now</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            min={-365}
            max={365}
            value={action.offsetDays}
            onChange={(e) => onChange({ ...action, offsetDays: Number(e.target.value) })}
          />
        </div>
      );

    case 'BLOCK_TRANSITION':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Block message</Label>
          <Input
            className="h-8 text-sm"
            placeholder="Reason for blocking"
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
          />
        </div>
      );
  }
}

export function ActionEditor({ actions, onChange }: ActionEditorProps) {
  const addAction = () => onChange([...actions, buildDefaultAction('SET_STATUS')]);

  const updateAction = (index: number, action: WorkflowAction) => {
    const updated = [...actions];
    updated[index] = action;
    onChange(updated);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const handleTypeChange = (index: number, type: ActionType) => {
    updateAction(index, buildDefaultAction(type));
  };

  return (
    <div className="space-y-2">
      {actions.map((action, index) => (
        <Card key={index} className="gap-0 py-0 p-3">
          <div className="flex items-start gap-2">
            <GripVertical className="mt-2 size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={action.type}
                  onValueChange={(val) => {
                    if (val) handleTypeChange(index, val as ActionType);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue>
                      {(value: string | null) =>
                        value ? ACTION_LABELS[value as ActionType] : 'Select action'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t} label={ACTION_LABELS[t]}>
                        {ACTION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove action"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAction(index)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <ActionParamEditor
                action={action}
                onChange={(updated) => updateAction(index, updated)}
              />
            </div>
          </div>
        </Card>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-8 text-sm"
        onClick={addAction}
      >
        <Plus className="mr-1 size-3.5" />
        Add Action
      </Button>
    </div>
  );
}
