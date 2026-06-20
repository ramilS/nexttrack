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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { EnumValuesEditor } from './enum-values-editor';
import type { CustomFieldType, CustomField, CreateCustomFieldInput } from '@/lib/api/custom-fields.api';

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date & Time' },
  { value: 'ENUM', label: 'Single Select' },
  { value: 'MULTI_ENUM', label: 'Multi Select' },
  { value: 'USER', label: 'User' },
  { value: 'MULTI_USER', label: 'Multi User' },
  { value: 'VERSION', label: 'Version' },
  { value: 'MULTI_VERSION', label: 'Multi Version' },
  { value: 'PERIOD', label: 'Period' },
  { value: 'URL', label: 'URL' },
];

interface CustomFieldFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateCustomFieldInput) => void;
  isPending?: boolean;
  defaultValues?: CustomField;
  title?: string;
}

interface EnumOptionState {
  id?: string;
  name: string;
  color?: string;
}

interface PersistedEnumOption {
  id: string;
  name: string;
  color: string | null;
  ordinal: number;
}

function readEnumOptions(field?: CustomField): EnumOptionState[] {
  const opts = (field?.config as { options?: PersistedEnumOption[] })?.options;
  if (!Array.isArray(opts)) return [];
  return [...opts]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((o) => ({ id: o.id, name: o.name, color: o.color ?? undefined }));
}

export function CustomFieldForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Create Custom Field',
}: CustomFieldFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [type, setType] = useState<CustomFieldType>(defaultValues?.type ?? 'TEXT');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [isRequired, setIsRequired] = useState(defaultValues?.isRequired ?? false);
  const [enumValues, setEnumValues] = useState<EnumOptionState[]>(
    readEnumOptions(defaultValues),
  );

  // Number config
  const [min, setMin] = useState<string>(String((defaultValues?.config as Record<string, unknown>)?.min ?? ''));
  const [max, setMax] = useState<string>(String((defaultValues?.config as Record<string, unknown>)?.max ?? ''));
  const [unit, setUnit] = useState((defaultValues?.config as Record<string, unknown>)?.unit as string ?? '');

  // Text config
  const [placeholder, setPlaceholder] = useState(
    (defaultValues?.config as Record<string, unknown>)?.placeholder as string ?? '',
  );

  const isEditing = !!defaultValues;
  const isEnumType = type === 'ENUM' || type === 'MULTI_ENUM';

  function buildConfig(): Record<string, unknown> {
    const cfg: Record<string, unknown> = { type };

    switch (type) {
      case 'TEXT':
        if (placeholder) cfg.placeholder = placeholder;
        break;
      case 'NUMBER':
        if (min !== '') cfg.min = Number(min);
        if (max !== '') cfg.max = Number(max);
        if (unit) cfg.unit = unit;
        break;
      case 'ENUM':
      case 'MULTI_ENUM':
        cfg.options = enumValues.map((opt, i) => ({
          ...(opt.id ? { id: opt.id } : {}),
          name: opt.name,
          color: opt.color ?? null,
          ordinal: i,
        }));
        break;
      case 'URL':
        if (placeholder) cfg.placeholder = placeholder;
        break;
    }

    return cfg;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      type,
      description: description.trim() || undefined,
      isRequired,
      config: buildConfig() as CreateCustomFieldInput['config'],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Field name..."
              autoFocus
            />
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v: string | null) => {
                  if (v) setType(v as CustomFieldType);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {(value: string | null) => {
                      const ft = FIELD_TYPES.find((t) => t.value === value);
                      return ft?.label ?? 'Select type';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value} label={ft.label}>
                      {ft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cf-desc">Description</Label>
            <Input
              id="cf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">Required field</span>
          </label>

          {/* Type-specific config */}
          {(type === 'TEXT' || type === 'URL') && (
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                placeholder="Placeholder text..."
              />
            </div>
          )}

          {type === 'NUMBER' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Min</Label>
                <Input value={min} onChange={(e) => setMin(e.target.value)} type="number" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max</Label>
                <Input value={max} onChange={(e) => setMax(e.target.value)} type="number" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pts" className="h-8" />
              </div>
            </div>
          )}

          {isEnumType && (
            <div className="space-y-2">
              <Label>Options</Label>
              <EnumValuesEditor values={enumValues} onChange={setEnumValues} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
