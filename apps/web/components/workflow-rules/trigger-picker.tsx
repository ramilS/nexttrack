'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  ArrowLeftRight,
  Pencil,
  MessageSquare,
  Clock,
  CalendarClock,
} from 'lucide-react';
import type { WorkflowTrigger } from '@/lib/api/workflow-rules.api';

interface TriggerPickerProps {
  trigger: WorkflowTrigger;
  triggerConfig: Record<string, unknown> | null;
  onTriggerChange: (t: WorkflowTrigger) => void;
  onConfigChange: (c: Record<string, unknown>) => void;
}

const TRIGGERS: {
  value: WorkflowTrigger;
  icon: React.ElementType;
  label: string;
  description: string;
}[] = [
  {
    value: 'ON_CREATE',
    icon: Plus,
    label: 'Issue Created',
    description: 'When a new issue is created',
  },
  {
    value: 'ON_STATUS_CHANGE',
    icon: ArrowLeftRight,
    label: 'Status Changed',
    description: 'When issue status changes',
  },
  {
    value: 'ON_FIELD_CHANGE',
    icon: Pencil,
    label: 'Field Changed',
    description: 'When a specific field is updated',
  },
  {
    value: 'ON_COMMENT',
    icon: MessageSquare,
    label: 'Comment Added',
    description: 'When someone comments',
  },
  {
    value: 'ON_SCHEDULE',
    icon: Clock,
    label: 'Scheduled',
    description: 'Run on a recurring schedule',
  },
  {
    value: 'ON_DUE_DATE',
    icon: CalendarClock,
    label: 'Due Date',
    description: 'Before or after due date',
  },
];

const FIELD_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'type', label: 'Type' },
  { value: 'tags', label: 'Tags' },
];

export function TriggerPicker({
  trigger,
  triggerConfig,
  onTriggerChange,
  onConfigChange,
}: TriggerPickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRIGGERS.map((t) => {
          const Icon = t.icon;
          const isActive = trigger === t.value;
          return (
            <Card
              key={t.value}
              className={cn(
                'gap-0 py-0 cursor-pointer p-3 transition-colors',
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-muted-foreground/30',
              )}
              onClick={() => onTriggerChange(t.value)}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <span className="text-sm font-medium">{t.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.description}
              </p>
            </Card>
          );
        })}
      </div>

      {trigger === 'ON_FIELD_CHANGE' && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label className="text-xs">Field to watch</Label>
          <Select
            value={(triggerConfig?.field as string) ?? ''}
            onValueChange={(val) => onConfigChange({ ...triggerConfig, field: val })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>
                {(value: string | null) => {
                  const opt = FIELD_OPTIONS.find((f) => f.value === value);
                  return opt?.label ?? 'Select field';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FIELD_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} label={f.label}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {trigger === 'ON_SCHEDULE' && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label className="text-xs">Cron expression or interval</Label>
          <Input
            className="h-8 text-sm"
            placeholder="e.g. 0 9 * * 1 or every 4h"
            value={(triggerConfig?.schedule as string) ?? ''}
            onChange={(e) =>
              onConfigChange({ ...triggerConfig, schedule: e.target.value })
            }
          />
        </div>
      )}

      {trigger === 'ON_DUE_DATE' && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label className="text-xs">
            Offset days (negative = before due date)
          </Label>
          <Input
            className="h-8 text-sm"
            type="number"
            placeholder="e.g. -1 for 1 day before"
            value={(triggerConfig?.offsetDays as string) ?? ''}
            onChange={(e) =>
              onConfigChange({
                ...triggerConfig,
                offsetDays: Number(e.target.value),
              })
            }
          />
        </div>
      )}
    </div>
  );
}
