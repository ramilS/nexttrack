import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import { ActiveFilters } from './active-filters';

const NO_FILTERS = {
  status: null,
  priority: null,
  assignee: null,
  type: null,
  tag: null,
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};

describe('ActiveFilters', () => {
  it('renders nothing when there are no active filters', () => {
    const { container } = render(
      <ActiveFilters filters={NO_FILTERS} onRemove={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip per active filter', () => {
    render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, status: 'Open', assignee: 'me', tag: 'backend' }}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('calls onRemove with the filter key when a chip is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, tag: 'backend' }}
        onRemove={onRemove}
        onClearAll={vi.fn()}
      />,
    );

    await user.click(screen.getByText('backend'));
    expect(onRemove).toHaveBeenCalledWith('tag');
  });

  it('shows "Clear all" only when more than one chip is present', () => {
    const { rerender } = render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, status: 'Open' }}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    rerender(
      <ActiveFilters
        filters={{ ...NO_FILTERS, status: 'Open', priority: 'HIGH' }}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('calls onClearAll when "Clear all" is clicked', async () => {
    const onClearAll = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, status: 'Open', priority: 'HIGH' }}
        onRemove={vi.fn()}
        onClearAll={onClearAll}
      />,
    );

    await user.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('renders the status chip with the resolved workflow colour', () => {
    const { container } = render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, status: 'In Progress' }}
        statusOption={{ id: 's1', name: 'In Progress', color: '#3b82f6', category: 'STARTED' }}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    // The colour is applied as an inline background (jsdom normalises #3b82f6 to rgb).
    const dot = container.querySelector('[style*="background"]');
    expect(dot?.getAttribute('style')).toContain('rgb(59, 130, 246)');
  });

  it('shows the sort chip only for a non-default sort', () => {
    render(
      <ActiveFilters
        filters={{ ...NO_FILTERS, sortBy: 'priority', sortOrder: 'asc' }}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sort:/)).toBeInTheDocument();
  });
});
