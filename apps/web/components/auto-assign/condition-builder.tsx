'use client';

import { Label } from '@/components/ui/label';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { TagBadge } from '@/components/shared/tag-badge';
import { useTags } from '@/lib/hooks/use-tags';
import type { RuleConditions } from '@/lib/api/auto-assign.api';
import { cn } from '@/lib/utils';
import { ISSUE_TYPE_OPTIONS, ISSUE_PRIORITY_OPTIONS } from '@repo/shared';

interface ConditionBuilderProps {
  projectKey: string;
  conditions: RuleConditions;
  onChange: (conditions: RuleConditions) => void;
}

export function ConditionBuilder({ projectKey, conditions, onChange }: ConditionBuilderProps) {
  const { data: tags } = useTags(projectKey);

  function toggleArrayValue(field: keyof RuleConditions, value: string) {
    const current = (conditions[field] as string[] | undefined) ?? [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...conditions, [field]: updated.length > 0 ? updated : undefined });
  }

  return (
    <div className="space-y-4">
      {/* Issue Types */}
      <div className="space-y-2">
        <Label className="text-xs">Issue Types</Label>
        <p className="text-xs text-muted-foreground">Empty = any type</p>
        <div className="flex flex-wrap gap-1.5">
          {ISSUE_TYPE_OPTIONS.map((type) => {
            const selected = conditions.issueType?.includes(type.value) ?? false;
            return (
              <button
                key={type.value}
                type="button"
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
                onClick={() => toggleArrayValue('issueType', type.value)}
              >
                <IssueTypeIcon type={type.value} className="size-3.5" />
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priorities */}
      <div className="space-y-2">
        <Label className="text-xs">Priorities</Label>
        <p className="text-xs text-muted-foreground">Empty = any priority</p>
        <div className="flex flex-wrap gap-1.5">
          {ISSUE_PRIORITY_OPTIONS.map((priority) => {
            const selected = conditions.priority?.includes(priority.value) ?? false;
            return (
              <button
                key={priority.value}
                type="button"
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
                onClick={() => toggleArrayValue('priority', priority.value)}
              >
                <PriorityBadge priority={priority.value} showLabel={false} />
                {priority.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Tags</Label>
          <p className="text-xs text-muted-foreground">Empty = any tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const selected = conditions.tagIds?.includes(tag.id) ?? false;
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent',
                  )}
                  onClick={() => toggleArrayValue('tagIds', tag.id)}
                >
                  <TagBadge name={tag.name} color={tag.color} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
