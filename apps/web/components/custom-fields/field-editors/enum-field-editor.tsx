'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagBadge } from '@/components/shared/tag-badge';

interface EnumOption {
  id: string;
  name: string;
  color?: string;
}

interface EnumFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: EnumOption[];
  inline?: boolean;
}

export function EnumFieldEditor({ value, onChange, options, inline }: EnumFieldEditorProps) {
  const selectedOption = options.find((o) => o.id === value);

  return (
    <Select
      value={value ?? null}
      onValueChange={(v: string | null) => {
        onChange(v);
      }}
    >
      <SelectTrigger
        className={
          inline
            ? 'h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50'
            : 'h-8 w-full text-xs'
        }
      >
        <SelectValue>
          {selectedOption ? (
            inline ? (
              <span>{selectedOption.name}</span>
            ) : (
              <TagBadge name={selectedOption.name} color={selectedOption.color ?? 'gray'} />
            )
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-48">
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} label={opt.name}>
            <TagBadge name={opt.name} color={opt.color ?? 'gray'} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
