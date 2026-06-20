import { describe, it, expect } from 'vitest';
import { render } from '@/test/test-utils';
import { ColorDot } from './color-dot';

describe('ColorDot', () => {
  it('renders the hex color via inline style', () => {
    const { container } = render(<ColorDot color="#6366f1" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(99, 102, 241)');
  });

  it('falls back to muted-foreground when color is null', () => {
    const { container } = render(<ColorDot color={null} />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.className).toContain('bg-muted-foreground');
    expect(dot.style.backgroundColor).toBe('');
  });

  it('falls back to muted-foreground for a non-hex value', () => {
    const { container } = render(<ColorDot color="blue" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.className).toContain('bg-muted-foreground');
    expect(dot.style.backgroundColor).toBe('');
  });

  it('applies sm size', () => {
    const { container } = render(<ColorDot color="#6366f1" size="sm" />);
    expect((container.firstChild as HTMLElement).className).toContain('size-2');
  });

  it('applies md size by default', () => {
    const { container } = render(<ColorDot color="#6366f1" />);
    expect((container.firstChild as HTMLElement).className).toContain('size-2.5');
  });
});
