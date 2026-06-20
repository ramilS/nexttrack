import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import type { Board } from '@/lib/api/boards.api';
import BacklogPage from './page';

const mockOpen = vi.fn();
let mockBoards: Board[] | undefined;

vi.mock('next/navigation', () => ({
  useParams: () => ({ key: 'PROJ' }),
}));

vi.mock('@/lib/hooks/use-boards', () => ({
  useBoards: () => ({ data: mockBoards }),
}));

vi.mock('@/lib/stores/create-board.store', () => ({
  useCreateBoardStore: (selector: (state: { open: typeof mockOpen }) => unknown) =>
    selector({ open: mockOpen }),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/components/boards/sprint-backlog', () => ({
  SprintBacklog: () => <div data-testid="sprint-backlog" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

function buildBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000020',
    name: 'Engineering',
    type: 'SCRUM',
    columns: [],
    swimlaneBy: 'NONE',
    filterQuery: null,
    autoCloseOnDone: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBoards = undefined;
});

describe('BacklogPage — no board yet', () => {
  it('renders the empty state with a create action when no board exists', () => {
    mockBoards = [];
    render(<BacklogPage />);
    expect(screen.getByText('No board yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create board' })).toBeInTheDocument();
    expect(screen.queryByTestId('sprint-backlog')).not.toBeInTheDocument();
  });

  it('opens the create-board dialog for the current project on action click', async () => {
    mockBoards = [];
    render(<BacklogPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Create board' }));
    expect(mockOpen).toHaveBeenCalledWith('PROJ');
  });
});

describe('BacklogPage — board exists', () => {
  it('renders the sprint backlog instead of the empty state', () => {
    mockBoards = [buildBoard()];
    render(<BacklogPage />);
    expect(screen.getByTestId('sprint-backlog')).toBeInTheDocument();
    expect(screen.queryByText('No board yet')).not.toBeInTheDocument();
  });
});
