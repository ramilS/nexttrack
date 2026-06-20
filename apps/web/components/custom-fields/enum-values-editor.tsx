'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EnumValue {
  id?: string;
  name: string;
  color?: string;
}

interface EnumValuesEditorProps {
  values: EnumValue[];
  onChange: (values: EnumValue[]) => void;
  className?: string;
}

const OPTION_COLORS = [
  'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'purple', 'pink', 'gray',
];

export function EnumValuesEditor({ values, onChange, className }: EnumValuesEditorProps) {
  const [newName, setNewName] = useState('');

  function addValue() {
    const name = newName.trim();
    if (!name) return;
    if (values.some((v) => v.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...values, { name, color: 'blue' }]);
    setNewName('');
  }

  function removeValue(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function updateColor(index: number, color: string) {
    const updated = [...values];
    updated[index] = { ...updated[index]!, color };
    onChange(updated);
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-1">
        {values.map((val, i) => (
          <div
            key={val.id ?? `new-${i}`}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
          >
            <GripVertical className="size-3.5 text-muted-foreground shrink-0 cursor-grab" />
            <div
              className={cn('size-4 rounded-full shrink-0', `bg-${val.color ?? 'blue'}-500`)}
            />
            <span className="flex-1 text-sm truncate">{val.name}</span>
            <select
              value={val.color ?? 'blue'}
              onChange={(e) => updateColor(i, e.target.value)}
              className="h-6 text-xs bg-transparent border-0 outline-none cursor-pointer"
            >
              {OPTION_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={() => removeValue(i)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add option..."
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue();
            }
          }}
        />
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={addValue} disabled={!newName.trim()}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
