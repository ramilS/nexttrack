import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { TagBadge } from './tag-badge';

describe('TagBadge', () => {
  it('renders the tag name', () => {
    render(<TagBadge name="Bug" color="#ef4444" />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('renders a custom hex via the --tag CSS variable', () => {
    const { container } = render(<TagBadge name="Feature" color="#3b82f6" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('tag-badge');
    expect(el.style.getPropertyValue('--tag')).toBe('#3b82f6');
  });

  it('maps a legacy named color to its hex', () => {
    const { container } = render(<TagBadge name="Bug" color="red" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue('--tag')).toBe('#ef4444');
  });

  it('falls back to gray hex for an unknown color', () => {
    const { container } = render(<TagBadge name="Tag" color="magenta" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue('--tag')).toBe('#6b7280');
  });
});
