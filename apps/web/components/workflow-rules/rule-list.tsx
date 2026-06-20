'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import {
  useWorkflowRules,
  useUpdateWorkflowRule,
  useDeleteWorkflowRule,
} from '@/lib/hooks/use-workflow-rules';
import { RuleFormDialog } from './rule-form-dialog';
import { RuleDetailPanel } from './rule-detail-panel';
import type { WorkflowRule, WorkflowTrigger } from '@/lib/api/workflow-rules.api';

interface RuleListProps {
  projectKey: string;
}

const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  ON_CREATE: 'Created',
  ON_STATUS_CHANGE: 'Status Change',
  ON_FIELD_CHANGE: 'Field Change',
  ON_COMMENT: 'Comment',
  ON_SCHEDULE: 'Scheduled',
  ON_DUE_DATE: 'Due Date',
};

const TRIGGER_COLORS: Record<WorkflowTrigger, string> = {
  ON_CREATE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  ON_STATUS_CHANGE: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  ON_FIELD_CHANGE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  ON_COMMENT: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  ON_SCHEDULE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
  ON_DUE_DATE: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
};

export function RuleList({ projectKey }: RuleListProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editRule, setEditRule] = useState<WorkflowRule | undefined>();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: rules, isLoading } = useWorkflowRules(projectKey);
  const updateRule = useUpdateWorkflowRule(projectKey);
  const deleteRule = useDeleteWorkflowRule(projectKey);

  const handleToggle = (rule: WorkflowRule, enabled: boolean) => {
    updateRule.mutate({ ruleId: rule.id, data: { isEnabled: enabled } });
  };

  const handleDelete = (ruleId: string) => {
    deleteRule.mutate(ruleId, {
      onSuccess: () => {
        setConfirmDeleteId(null);
        if (selectedRuleId === ruleId) setSelectedRuleId(null);
      },
    });
  };

  const handleEdit = (rule: WorkflowRule) => {
    setEditRule(rule);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditRule(undefined);
    setFormOpen(true);
  };

  return (
    <AsyncContent
      loading={isLoading}
      empty={!rules?.length}
      emptyState={
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">0 rules</p>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-1 size-3.5" />
              New Rule
            </Button>
          </div>
          <Card className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="size-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-sm font-medium">No automation rules</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create rules to automate repetitive workflow actions.
            </p>
            <Button size="sm" className="mt-4" onClick={handleCreate}>
              <Plus className="mr-1 size-3.5" />
              Create your first rule
            </Button>
          </Card>
          <RuleFormDialog
            projectKey={projectKey}
            open={formOpen}
            onOpenChange={setFormOpen}
            editRule={editRule}
          />
        </div>
      }
    >
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rules?.length ?? 0} rule{(rules?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1 size-3.5" />
          New Rule
        </Button>
      </div>

        <div className="space-y-2">
          {rules?.map((rule) => (
            <Card key={rule.id} className="gap-0 py-0 p-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={rule.isEnabled}
                  onCheckedChange={(checked) => handleToggle(rule, checked)}
                />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setSelectedRuleId(rule.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-medium truncate',
                        !rule.isEnabled && 'text-muted-foreground',
                      )}
                    >
                      {rule.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] px-1.5 py-0 font-normal',
                        TRIGGER_COLORS[rule.trigger],
                      )}
                    >
                      {TRIGGER_LABELS[rule.trigger]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {rule.actions.length} action
                      {rule.actions.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {rule.executionCount} execution
                      {rule.executionCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleEdit(rule)}
                  >
                    Edit
                  </Button>
                  {confirmDeleteId === rule.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleteRule.isPending}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(rule.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

      {selectedRuleId && (
        <RuleDetailPanel projectKey={projectKey} ruleId={selectedRuleId} />
      )}

      <RuleFormDialog
        projectKey={projectKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        editRule={editRule}
      />
    </div>
    </AsyncContent>
  );
}
