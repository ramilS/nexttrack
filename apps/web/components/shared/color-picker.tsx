'use client';

import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { COLOR_PRESETS, HEX_COLOR_REGEX } from '@/lib/constants/color-presets';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  presets?: readonly string[];
  className?: string;
  'aria-label'?: string;
}

export function ColorPicker({
  value,
  onChange,
  presets = COLOR_PRESETS,
  className,
  'aria-label': ariaLabel = 'Color',
}: ColorPickerProps) {
  const [draft, setDraft] = useState(value);

  function commitDraft(next: string) {
    setDraft(next);
    if (HEX_COLOR_REGEX.test(next)) onChange(next);
  }

  return (
    <Popover onOpenChange={(open) => open && setDraft(value)}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          'size-7 rounded-full border border-border outline-2 outline-offset-2 outline-transparent transition-all hover:scale-110',
          className,
        )}
        style={{ backgroundColor: value }}
      />
      <PopoverContent className="w-56">
        <div className="grid grid-cols-5 gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              onClick={() => {
                setDraft(preset);
                onChange(preset);
              }}
              className="size-7 rounded-full outline-2 outline-offset-2 transition-all hover:scale-110"
              style={{
                backgroundColor: preset,
                outlineColor: value === preset ? preset : 'transparent',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="size-7 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: HEX_COLOR_REGEX.test(draft) ? draft : 'transparent' }}
          />
          <Input
            aria-label="Hex color"
            value={draft}
            onChange={(e) => commitDraft(e.target.value)}
            placeholder="#6366f1"
            className="font-mono"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
