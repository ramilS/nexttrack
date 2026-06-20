import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders label for string status', () => {
    render(<StatusBadge status="TODO" />);
    expect(screen.getByText('To Do')).toBeInTheDocument();
  });

  it('renders raw string when no config match', () => {
    render(<StatusBadge status="UNKNOWN" />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<StatusBadge status="TODO" showLabel={false} />);
    expect(screen.queryByText('To Do')).not.toBeInTheDocument();
  });

  it('renders dot with correct class for BACKLOG', () => {
    const { container } = render(<StatusBadge status="BACKLOG" />);
    const dot = container.querySelector('.bg-status-backlog');
    expect(dot).toBeInTheDocument();
  });

  it('renders dot with correct class for IN_PROGRESS', () => {
    const { container } = render(<StatusBadge status="IN_PROGRESS" />);
    const dot = container.querySelector('.bg-status-in-progress');
    expect(dot).toBeInTheDocument();
  });

  it('renders dot with correct class for DONE', () => {
    const { container } = render(<StatusBadge status="DONE" />);
    const dot = container.querySelector('.bg-status-done');
    expect(dot).toBeInTheDocument();
  });

  it('accepts status object with name and category', () => {
    render(<StatusBadge status={{ id: 's1', name: 'In Review', category: 'STARTED' }} />);
    expect(screen.getByText('In Review')).toBeInTheDocument();
  });

  it('uses custom color via style when provided', () => {
    const { container } = render(
      <StatusBadge status={{ id: 's1', name: 'Custom', category: 'UNSTARTED', color: '#ff0000' }} />,
    );
    const dot = container.querySelector('[style]');
    expect(dot).toHaveStyle({ backgroundColor: '#ff0000' });
  });
});
