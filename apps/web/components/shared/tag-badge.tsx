import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { HEX_COLOR_REGEX } from '@/lib/constants/color-presets';

const NAMED_COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  purple: '#a855f7',
  pink: '#ec4899',
  gray: '#6b7280',
};

const FALLBACK_HEX = NAMED_COLOR_HEX.gray!;

function resolveHex(color: string): string {
  if (HEX_COLOR_REGEX.test(color)) return color;
  return NAMED_COLOR_HEX[color] ?? FALLBACK_HEX;
}

interface TagBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function TagBadge({ name, color, className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'tag-badge inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
        className,
      )}
      style={{ '--tag': resolveHex(color) } as CSSProperties}
    >
      {name}
    </span>
  );
}
