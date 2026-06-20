import { cn } from '@/lib/utils';
import { HEX_COLOR_REGEX } from '@/lib/constants/color-presets';

interface ColorDotProps {
  color: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function ColorDot({ color, size = 'md', className }: ColorDotProps) {
  const sizeClass = size === 'sm' ? 'size-2' : 'size-2.5';
  const isHex = !!color && HEX_COLOR_REGEX.test(color);

  return (
    <span
      className={cn('rounded-full shrink-0', sizeClass, !isHex && 'bg-muted-foreground', className)}
      style={isHex ? { backgroundColor: color } : undefined}
    />
  );
}
