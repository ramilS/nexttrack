'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVersions } from '@/lib/hooks/use-versions';
import { Package } from 'lucide-react';

interface VersionFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  projectKey: string;
  inline?: boolean;
}

export function VersionFieldEditor({ value, onChange, projectKey, inline }: VersionFieldEditorProps) {
  const { data: versions } = useVersions(projectKey);

  const selectedVersion = versions?.find((v) => v.id === value);

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v: string | null) => {
        onChange(v);
      }}
    >
      <SelectTrigger className={inline
        ? 'h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50'
        : 'h-8 w-full text-xs'
      }>
        <SelectValue placeholder="None">
          {selectedVersion ? (
            <span className="flex items-center gap-1.5">
              <Package className="size-3 text-muted-foreground" />
              {selectedVersion.name}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {versions?.map((v) => (
          <SelectItem key={v.id} value={v.id} label={v.name}>
            <Package className="size-3 text-muted-foreground" />
            {v.name}
            {v.status !== 'UNRELEASED' && (
              <span className="text-xs text-muted-foreground ml-1">({v.status.toLowerCase()})</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
