import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import { BacklogPanel } from './backlog-panel';
import type { BoardIssueCard } from '@/lib/api/boards.api';

const mockMutate = vi.fn();

vi.mock('@/lib/hooks/use-sprints', () => ({
  useBacklogIssues: vi.fn(() => ({
    data: {
      pages: [{ items: mockBacklogIssues, meta: { nextCursor: null, pageSize: 25, hasNextPage: false } }],
      pageParams: [null],
    },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  })),
  useAddIssuesToSprint: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render: renderProp }: { children: React.ReactNode; render?: React.ReactElement }) => {
    if (renderProp) {
      const Tag = renderProp.type as React.ElementType;
      const { ref: _ref, ...rest } = renderProp.props as Record<string, unknown>;
      return <Tag {...rest}>{children}</Tag>;
    }
    return <span>{children}</span>;
  },
  TooltipContent: () => null,
}));

vi.mock('@/components/ui/input', () => ({
  Input: vi.fn((props: Record<string, unknown>) => {
    const { ref: _ref, ...rest } = props;
    return <input {...(rest as React.InputHTMLAttributes<HTMLInputElement>)} />;
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/shared/issue-type-icon', () => ({
  IssueTypeIcon: ({ type }: { type: string }) => (
    <span data-testid="issue-type-icon">{type}</span>
  ),
}));

vi.mock('@/components/shared/priority-badge', () => ({
  PriorityBadge: ({ priority }: { priority: string }) => (
    <span data-testid="priority-badge">{priority}</span>
  ),
}));

vi.mock('@/components/shared/load-more-button', () => ({
  LoadMoreButton: () => null,
}));

function buildIssueCard(overrides: Partial<BoardIssueCard> = {}): BoardIssueCard {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    number: 42,
    title: 'Fix login bug',
    type: 'BUG',
    priority: 'HIGH',
    statusId: '00000000-0000-4000-8000-000000000010',
    projectId: '00000000-0000-4000-8000-000000000020',
    assigneeId: null,
    parentId: null,
    sprintId: null,
    estimate: null,
    spent: 0,
    dueDate: null,
    isOverdue: false,
    commentsCount: 0,
    hasAttachments: false,
    childrenCount: 0,
    completedChildrenCount: 0,
    descriptionPreview: null,
    assignee: null,
    tags: [],
    ...overrides,
  };
}

let mockBacklogIssues: BoardIssueCard[] = [];

const defaultProps = {
  boardId: 'board-1',
  projectKey: 'PROJ',
  currentSprintId: 'sprint-1',
  currentSprintName: 'Sprint 5',
  open: true,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBacklogIssues = [
    buildIssueCard({ id: 'issue-1', number: 42, title: 'Fix login bug', type: 'BUG', priority: 'HIGH' }),
    buildIssueCard({ id: 'issue-2', number: 43, title: 'Add dashboard', type: 'FEATURE', priority: 'MEDIUM' }),
  ];
});

describe('BacklogPanel', () => {
  it('renders header', () => {
    render(<BacklogPanel {...defaultProps} />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('renders target sprint indicator', () => {
    render(<BacklogPanel {...defaultProps} />);
    expect(screen.getByText('Sprint 5')).toBeInTheDocument();
  });

  it('hides sprint indicator when no sprint selected', () => {
    render(
      <BacklogPanel
        {...defaultProps}
        currentSprintId={undefined}
        currentSprintName={undefined}
      />,
    );
    expect(screen.queryByText('Add to:')).not.toBeInTheDocument();
  });

  it('renders issue rows with key, title, type, and priority', () => {
    render(<BacklogPanel {...defaultProps} />);
    expect(screen.getByText('PROJ-42')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('PROJ-43')).toBeInTheDocument();
    expect(screen.getByText('Add dashboard')).toBeInTheDocument();
  });

  it('shows empty message when backlog is empty', () => {
    mockBacklogIssues = [];
    render(<BacklogPanel {...defaultProps} />);
    expect(screen.getByText('Backlog is empty')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<BacklogPanel {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText('Close backlog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls addIssues mutation when arrow button clicked', async () => {
    render(<BacklogPanel {...defaultProps} />);
    const addButtons = screen.getAllByLabelText(/Add PROJ-\d+ to sprint/);
    await userEvent.click(addButtons[0]!);
    expect(mockMutate).toHaveBeenCalledWith(
      { sprintId: 'sprint-1', issueIds: ['issue-1'] },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it('does not show add buttons when no sprint selected', () => {
    render(
      <BacklogPanel {...defaultProps} currentSprintId={undefined} />,
    );
    expect(screen.queryByLabelText(/Add PROJ-\d+ to sprint/)).not.toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<BacklogPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search backlog...')).toBeInTheDocument();
  });

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn();
    render(<BacklogPanel {...defaultProps} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not listen for Escape when closed', async () => {
    const onClose = vi.fn();
    render(<BacklogPanel {...defaultProps} open={false} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on pointer down outside the panel', async () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <BacklogPanel {...defaultProps} onClose={onClose} />
      </div>,
    );
    await userEvent.click(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the panel', async () => {
    const onClose = vi.fn();
    render(<BacklogPanel {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByPlaceholderText('Search backlog...'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when clicking the backlog toggle', async () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button" data-backlog-toggle>
          toggle
        </button>
        <BacklogPanel {...defaultProps} onClose={onClose} />
      </div>,
    );
    await userEvent.click(screen.getByText('toggle'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not listen for outside clicks when closed', async () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <BacklogPanel {...defaultProps} open={false} onClose={onClose} />
      </div>,
    );
    await userEvent.click(screen.getByText('outside'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies translate-x-0 when open and -translate-x-full when closed', () => {
    const { container, rerender } = render(<BacklogPanel {...defaultProps} open={true} />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('translate-x-0');

    rerender(<BacklogPanel {...defaultProps} open={false} />);
    const panelAfter = container.firstElementChild as HTMLElement;
    expect(panelAfter.className).toContain('-translate-x-full');
  });
});
