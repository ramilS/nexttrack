import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<PageHeader title="Issues" description="All project issues" />);
    expect(screen.getByText('All project issues')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(
      <PageHeader title="Board" actions={<button data-testid="action">New</button>} />,
    );
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });

  it('does not render actions container when no actions', () => {
    const { container } = render(<PageHeader title="Board" />);
    // Should only have the title wrapper div
    expect(container.querySelectorAll('.shrink-0')).toHaveLength(0);
  });
});
