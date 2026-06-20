'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X, FolderPlus } from 'lucide-react';
import {
  CONDITION_FIELDS,
  type ConditionField,
  type ConditionOp,
  type WorkflowCondition,
  type ConditionLeaf,
} from '@repo/shared/schemas';
import { ISSUE_PRIORITY_OPTIONS, ISSUE_TYPE_OPTIONS } from '@repo/shared';

interface ConditionNodeEditorProps {
  node: WorkflowCondition;
  onChange: (node: WorkflowCondition) => void;
  onRemove: () => void;
  depth: number;
  projectKey: string;
}

type FieldKind = 'enum_priority' | 'enum_type' | 'string' | 'array';

const FIELD_META: Record<ConditionField, { label: string; kind: FieldKind }> = {
  type: { label: 'Type', kind: 'enum_type' },
  priority: { label: 'Priority', kind: 'enum_priority' },
  status: { label: 'Status', kind: 'string' },
  'status.category': { label: 'Status category', kind: 'string' },
  assignee: { label: 'Assignee', kind: 'string' },
  tag: { label: 'Tag', kind: 'array' },
  oldStatus: { label: 'Old status', kind: 'string' },
  newStatus: { label: 'New status', kind: 'string' },
};

const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'equals',
  neq: 'not equals',
  in: 'in',
  not_in: 'not in',
  gte: 'greater or equal',
  lte: 'less or equal',
  contains: 'contains',
  not_contains: 'not contains',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

const OPS_BY_KIND: Record<FieldKind, ConditionOp[]> = {
  enum_priority: ['eq', 'neq', 'gte', 'lte'],
  enum_type: ['in', 'not_in'],
  string: ['eq', 'neq', 'is_empty', 'is_not_empty'],
  array: ['contains', 'not_contains'],
};

function isAnd(c: WorkflowCondition): c is { and: WorkflowCondition[] } {
  return typeof c === 'object' && c !== null && 'and' in c && Array.isArray((c as { and: unknown }).and);
}

function isOr(c: WorkflowCondition): c is { or: WorkflowCondition[] } {
  return typeof c === 'object' && c !== null && 'or' in c && Array.isArray((c as { or: unknown }).or);
}

function isLeaf(c: WorkflowCondition): c is ConditionLeaf {
  return typeof c === 'object' && c !== null && 'field' in c && 'op' in c;
}

function defaultLeaf(): ConditionLeaf {
  return { field: 'status', op: 'eq', value: '' };
}

function LeafEditor({
  node,
  onChange,
  onRemove,
}: {
  node: ConditionLeaf;
  onChange: (node: ConditionLeaf) => void;
  onRemove: () => void;
}) {
  const kind = FIELD_META[node.field].kind;
  const ops = OPS_BY_KIND[kind];
  const showValue = node.op !== 'is_empty' && node.op !== 'is_not_empty';
  const isMulti = node.op === 'in' || node.op === 'not_in';

  const handleFieldChange = (raw: string | null) => {
    if (!raw) return;
    const field = raw as ConditionField;
    const newOps = OPS_BY_KIND[FIELD_META[field].kind];
    onChange({ field, op: newOps[0]!, value: '', values: [] });
  };

  const renderValueInput = () => {
    if (!showValue) return null;

    if (isMulti && kind === 'enum_type') {
      return (
        <Input
          className="h-8 w-48 text-xs"
          placeholder="TASK,BUG"
          value={(node.values ?? []).join(',')}
          onChange={(e) =>
            onChange({
              ...node,
              values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      );
    }

    if (kind === 'enum_priority') {
      return (
        <Select
          value={node.value ?? ''}
          onValueChange={(val) => {
            if (val) onChange({ ...node, value: val });
          }}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue>
              {(v: string | null) =>
                ISSUE_PRIORITY_OPTIONS.find((p) => p.value === v)?.label ?? 'Value'
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
      );
    }

    if (kind === 'enum_type') {
      return (
        <Select
          value={node.value ?? ''}
          onValueChange={(val) => {
            if (val) onChange({ ...node, value: val });
          }}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue>
              {(v: string | null) =>
                ISSUE_TYPE_OPTIONS.find((t) => t.value === v)?.label ?? 'Value'
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
      );
    }

    return (
      <Input
        className="h-8 w-40 text-xs"
        placeholder="Value"
        value={node.value ?? ''}
        onChange={(e) => onChange({ ...node, value: e.target.value })}
      />
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={node.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue>
            {(v: string | null) => (v ? FIELD_META[v as ConditionField].label : 'Field')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CONDITION_FIELDS.map((f) => (
            <SelectItem key={f} value={f} label={FIELD_META[f].label}>
              {FIELD_META[f].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={node.op}
        onValueChange={(val) => {
          if (val) onChange({ ...node, op: val as ConditionOp });
        }}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue>
            {(v: string | null) => (v ? OP_LABELS[v as ConditionOp] : 'Operator')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op} label={OP_LABELS[op]}>
              {OP_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderValueInput()}

      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove condition"
        className="size-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function GroupEditor({
  node,
  onChange,
  onRemove,
  depth,
  projectKey,
  kind,
}: {
  node: { and: WorkflowCondition[] } | { or: WorkflowCondition[] };
  onChange: (node: WorkflowCondition) => void;
  onRemove: () => void;
  depth: number;
  projectKey: string;
  kind: 'and' | 'or';
}) {
  const children = kind === 'and' ? (node as { and: WorkflowCondition[] }).and : (node as { or: WorkflowCondition[] }).or;

  const setChildren = (next: WorkflowCondition[]) => {
    onChange(kind === 'and' ? { and: next } : { or: next });
  };

  const toggleKind = () => {
    onChange(kind === 'and' ? { or: children } : { and: children });
  };

  const updateChild = (index: number, child: WorkflowCondition) => {
    const next = [...children];
    next[index] = child;
    setChildren(next);
  };

  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        'space-y-2',
        depth > 0 &&
          cn(
            'ml-4 border-l-2 pl-3',
            kind === 'and'
              ? 'border-blue-300 dark:border-blue-800'
              : 'border-amber-300 dark:border-amber-800',
          ),
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-6 px-2 text-xs font-medium uppercase',
            kind === 'and'
              ? 'border-blue-300 text-blue-600 dark:border-blue-800 dark:text-blue-400'
              : 'border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400',
          )}
          onClick={toggleKind}
        >
          {kind}
        </Button>
        {depth > 0 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove group"
            className="size-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      {children.map((child, index) => (
        <ConditionNodeEditor
          key={index}
          node={child}
          onChange={(updated) => updateChild(index, updated)}
          onRemove={() => removeChild(index)}
          depth={depth + 1}
          projectKey={projectKey}
        />
      ))}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setChildren([...children, defaultLeaf()])}
        >
          <Plus className="mr-1 size-3" />
          Add condition
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setChildren([...children, { and: [] }])}
        >
          <FolderPlus className="mr-1 size-3" />
          Add group
        </Button>
      </div>
    </div>
  );
}

export function ConditionNodeEditor({
  node,
  onChange,
  onRemove,
  depth,
  projectKey,
}: ConditionNodeEditorProps) {
  if (isAnd(node)) {
    return (
      <GroupEditor
        node={node}
        onChange={onChange}
        onRemove={onRemove}
        depth={depth}
        projectKey={projectKey}
        kind="and"
      />
    );
  }

  if (isOr(node)) {
    return (
      <GroupEditor
        node={node}
        onChange={onChange}
        onRemove={onRemove}
        depth={depth}
        projectKey={projectKey}
        kind="or"
      />
    );
  }

  if (isLeaf(node)) {
    return <LeafEditor node={node} onChange={onChange} onRemove={onRemove} />;
  }

  return null;
}
