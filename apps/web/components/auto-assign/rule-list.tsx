'use client';

import { useState } from 'react';
import { Plus, Trash2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useAutoAssignRules,
  useUpdateAutoAssignRule,
  useDeleteAutoAssignRule,
} from '@/lib/hooks/use-auto-assign';
import { RuleForm } from './rule-form';
import { cn } from '@/lib/utils';
import { AsyncContent } from '@/components/shared/async-content';

const STRATEGY_LABELS: Record<string, string> = {
  SPECIFIC_USER: 'Specific User',
  ROUND_ROBIN_TEAM: 'Round Robin',
  LEAST_LOADED_TEAM: 'Least Loaded',
  PROJECT_LEAD: 'Project Lead',
};

interface RuleListProps {
  projectKey: string;
  className?: string;
}

export function RuleList({ projectKey, className }: RuleListProps) {
  const { data: rules, isLoading } = useAutoAssignRules(projectKey);
  const updateRule = useUpdateAutoAssignRule(projectKey);
  const deleteRule = useDeleteAutoAssignRule(projectKey);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rules?.length ?? 0} rule{rules?.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          New Rule
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!rules || rules.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <UserCog className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No auto-assign rules</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create rules to automatically assign issues based on type, priority, or tags.
            </p>
          </div>
        }
        className="py-8"
      >
        <div className="grid gap-3">
          {rules?.map((rule) => (
            <Card key={rule.id} className="gap-0 py-0">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Switch
                    checked={rule.isEnabled}
                    onCheckedChange={(checked) =>
                      updateRule.mutate({ ruleId: rule.id, data: { isEnabled: checked } })
                    }
                  />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium truncate', !rule.isEnabled && 'text-muted-foreground')}>
                      {rule.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {STRATEGY_LABELS[rule.strategy] ?? rule.strategy}
                      </span>
                      {rule.assignee && (
                        <span className="text-xs text-muted-foreground">
                          → {rule.assignee.name}
                        </span>
                      )}
                      {rule.team && (
                        <span className="text-xs text-muted-foreground">
                          → {rule.team.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Condition badges */}
                  <div className="flex items-center gap-1">
                    {rule.conditions.issueType?.map((type) => (
                      <IssueTypeIcon key={type} type={type} className="size-3.5" />
                    ))}
                    {rule.conditions.priority?.map((p) => (
                      <PriorityBadge key={p} priority={p} showLabel={false} />
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => setDeletingRule({ id: rule.id, name: rule.name })}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AsyncContent>

      <RuleForm
        projectKey={projectKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={!!deletingRule}
        onOpenChange={(open) => { if (!open) setDeletingRule(null); }}
        title={`Delete rule "${deletingRule?.name}"`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingRule) deleteRule.mutate(deletingRule.id);
        }}
      />
    </div>
  );
}
