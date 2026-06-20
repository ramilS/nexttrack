import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EmptyState } from './empty-state';
import { Search } from 'lucide-react';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No issues found" />);
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try a different filter" />);
    expect(screen.getByText('Try a different filter')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: 'Create', onClick }} />);
    const btn = screen.getByText('Create');
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('does not render button when no action', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(<EmptyState title="Empty" icon={Search} />);
    // Lucide renders an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders keyboard shortcuts when provided', () => {
    render(
      <EmptyState
        title="Empty"
        shortcuts={[
          { keys: ['C'], label: 'Create issue' },
          { keys: ['⌘', 'K'], label: 'Command palette' },
        ]}
      />,
    );
    expect(screen.getByText('Create issue')).toBeInTheDocument();
    expect(screen.getByText('Command palette')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('does not render shortcuts section when not provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not render shortcuts section for empty array', () => {
    render(<EmptyState title="Empty" shortcuts={[]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
