'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, Play } from 'lucide-react';
import { useWorkflowRule } from '@/lib/hooks/use-workflow-rules';
import { RuleFormDialog } from './rule-form-dialog';
import { TestRunDialog } from './test-run-dialog';
import { ExecutionLog } from './execution-log';
import type {
  WorkflowCondition,
  WorkflowAction,
  WorkflowTrigger,
  ActionType,
} from '@repo/shared/schemas';

interface RuleDetailPanelProps {
  projectKey: string;
  ruleId: string;
}

const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  ON_CREATE: 'Issue Created',
  ON_STATUS_CHANGE: 'Status Changed',
  ON_FIELD_CHANGE: 'Field Changed',
  ON_COMMENT: 'Comment Added',
  ON_SCHEDULE: 'Scheduled',
  ON_DUE_DATE: 'Due Date',
};

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

function describeAction(action: WorkflowAction): string {
  switch (action.type) {
    case 'SET_STATUS':
      return `statusId: ${action.statusId}`;
    case 'SET_ASSIGNEE':
      return `userId: ${action.userId}`;
    case 'SET_PRIORITY':
      return `priority: ${action.priority}`;
    case 'SET_TYPE':
      return `type: ${action.issueType}`;
    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return `tagId: ${action.tagId}`;
    case 'ADD_COMMENT':
      return action.body.length > 60 ? `${action.body.slice(0, 60)}…` : action.body;
    case 'MOVE_TO_SPRINT':
      return `sprintId: ${action.sprintId}`;
    case 'SET_DUE_DATE':
      return `offsetDays: ${action.offsetDays}`;
    case 'BLOCK_TRANSITION':
      return action.message;
  }
}

function renderConditionTree(node: WorkflowCondition, depth = 0): React.ReactNode {
  if ('and' in node || 'or' in node) {
    const kind = 'and' in node ? 'AND' : 'OR';
    const children = 'and' in node ? node.and : node.or;
    return (
      <div style={{ marginLeft: depth * 16 }}>
        <span
          className={cn(
            'text-xs font-medium',
            kind === 'AND' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {kind}
        </span>
        {children.map((child, i) => (
          <div key={i}>{renderConditionTree(child, depth + 1)}</div>
        ))}
        {children.length === 0 && (
          <div className="text-xs text-muted-foreground italic" style={{ marginLeft: 16 }}>
            No conditions (always matches)
          </div>
        )}
      </div>
    );
  }

  const valueText = node.values?.length
    ? node.values.join(', ')
    : (node.value ?? 'any');
  return (
    <div className="text-xs text-muted-foreground" style={{ marginLeft: depth * 16 }}>
      <span className="font-mono">{node.field}</span>{' '}
      <span className="text-foreground">{node.op}</span>{' '}
      <span className="font-mono">{valueText}</span>
    </div>
  );
}

function renderActions(actions: WorkflowAction[]) {
  if (!actions.length) {
    return (
      <span className="text-xs text-muted-foreground italic">No actions</span>
    );
  }

  return (
    <div className="space-y-1">
      {actions.map((action, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
        >
          <span className="font-medium">{ACTION_LABELS[action.type]}</span>
          <span className="text-muted-foreground">{describeAction(action)}</span>
        </div>
      ))}
    </div>
  );
}

export function RuleDetailPanel({ projectKey, ruleId }: RuleDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'log'>('config');
  const [editOpen, setEditOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const { data: rule, isLoading } = useWorkflowRule(projectKey, ruleId);

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!rule) return null;

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-medium">{rule.name}</h3>
          {rule.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rule.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTestOpen(true)}
          >
            <Play className="mr-1 size-3" />
            Test Run
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1 size-3" />
            Edit
          </Button>
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          className={cn(
            'px-4 py-2 text-xs font-medium transition-colors',
            activeTab === 'config'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
        <button
          className={cn(
            'px-4 py-2 text-xs font-medium transition-colors',
            activeTab === 'log'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('log')}
        >
          Execution Log
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'config' ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                Trigger
              </h4>
              <Badge variant="secondary" className="text-xs">
                {TRIGGER_LABELS[rule.trigger]}
              </Badge>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                Conditions
              </h4>
              {renderConditionTree(rule.conditions)}
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">
                Actions
              </h4>
              {renderActions(rule.actions)}
            </div>
          </div>
        ) : (
          <ExecutionLog projectKey={projectKey} ruleId={ruleId} />
        )}
      </div>

      <RuleFormDialog
        projectKey={projectKey}
        open={editOpen}
        onOpenChange={setEditOpen}
        editRule={rule}
      />

      <TestRunDialog
        projectKey={projectKey}
        ruleId={ruleId}
        open={testOpen}
        onOpenChange={setTestOpen}
      />
    </Card>
  );
}
