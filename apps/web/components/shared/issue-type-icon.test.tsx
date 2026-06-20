import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { IssueTypeIcon } from './issue-type-icon';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <span data-testid="tooltip">{children}</span>,
}));

describe('IssueTypeIcon', () => {
  it('renders tooltip with label by default', () => {
    render(<IssueTypeIcon type="BUG" />);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Bug');
  });

  it('applies destructive class for BUG', () => {
    const { container } = render(<IssueTypeIcon type="BUG" />);
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
  });

  it('applies info class for TASK', () => {
    const { container } = render(<IssueTypeIcon type="TASK" />);
    expect(container.querySelector('.text-info')).toBeInTheDocument();
  });

  it('renders without tooltip when showTooltip is false', () => {
    render(<IssueTypeIcon type="TASK" showTooltip={false} />);
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });

  it('falls back to TASK for unknown type', () => {
    const { container } = render(<IssueTypeIcon type="UNKNOWN" />);
    expect(container.querySelector('.text-info')).toBeInTheDocument();
  });
});
