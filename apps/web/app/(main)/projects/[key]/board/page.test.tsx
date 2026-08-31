import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import type { Board } from '@/lib/api/boards.api';
import BoardPage from './page';

const mockOpen = vi.fn();
let mockBoards: Board[] | undefined;

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ key: 'PROJ' }),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/projects/PROJ/board',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/hooks/use-boards', () => ({
  useBoards: () => ({ data: mockBoards }),
}));

vi.mock('@/lib/hooks/use-sprints', () => ({
  useSprints: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/use-keyboard-shortcut', () => ({
  useKeyboardShortcut: vi.fn(),
}));

vi.mock('@/lib/stores/create-board.store', () => ({
  useCreateBoardStore: (selector: (state: { open: typeof mockOpen }) => unknown) =>
    selector({ open: mockOpen }),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/boards/board-switcher', () => ({
  BoardSwitcher: (props: {
    projectKey: string;
    currentBoardId: string | undefined;
    currentBoardName: string | undefined;
  }) => (
    <div
      data-testid="board-switcher"
      data-project-key={props.projectKey}
      data-board-id={props.currentBoardId ?? ''}
    >
      {props.currentBoardName ?? ''}
    </div>
  ),
}));

vi.mock('@/components/boards/kanban-board', () => ({
  KanbanBoard: () => <div data-testid="kanban-board" />,
}));

vi.mock('@/components/boards/sprint-board-header', () => ({
  SprintBoardHeader: () => <div data-testid="sprint-board-header" />,
}));

vi.mock('@/components/boards/backlog-panel', () => ({
  BacklogPanel: () => null,
}));

vi.mock('@/components/boards/board-settings-dialog', () => ({
  BoardSettingsDialog: () => <div data-testid="board-settings-dialog" />,
}));

vi.mock('@/components/boards/board-analytics', () => ({
  BoardAnalytics: () => <div data-testid="board-analytics" />,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  // Only the default "board" tab content is exercised in these tests.
  TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) =>
    value === 'board' ? <div>{children}</div> : null,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="swimlane-select">{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectValue: () => null,
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
    type: 'KANBAN',
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

describe('BoardPage — no board yet', () => {
  it('hides the Settings button when no board exists', () => {
    mockBoards = [];
    render(<BoardPage />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('hides the swimlane sort control when no board exists', () => {
    mockBoards = [];
    render(<BoardPage />);
    expect(screen.queryByTestId('swimlane-select')).not.toBeInTheDocument();
  });

  it('renders the empty state with a create action when no board exists', () => {
    mockBoards = [];
    render(<BoardPage />);
    expect(screen.getByText('No board yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create board' })).toBeInTheDocument();
  });

  it('opens the create-board dialog for the current project on action click', async () => {
    mockBoards = [];
    render(<BoardPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Create board' }));
    expect(mockOpen).toHaveBeenCalledWith('PROJ');
  });
});

describe('BoardPage — board exists', () => {
  it('shows the Settings button and swimlane sort control', () => {
    mockBoards = [buildBoard()];
    render(<BoardPage />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('swimlane-select')).toBeInTheDocument();
  });

  it('renders the board instead of the empty state', () => {
    mockBoards = [buildBoard()];
    render(<BoardPage />);
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    expect(screen.queryByText('No board yet')).not.toBeInTheDocument();
  });
});

describe('BoardPage — board switcher', () => {
  // The switcher spans every project the user belongs to, so it stays mounted
  // even when this project has one board (or none) — unlike the per-project
  // dropdown it replaced, which only appeared from the second board on.
  it('renders the switcher when the project has a single board', () => {
    mockBoards = [buildBoard({ id: 'b1', name: 'Engineering' })];
    render(<BoardPage />);
    expect(screen.getByTestId('board-switcher')).toHaveTextContent('Engineering');
  });

  it('renders the switcher when the project has no board at all', () => {
    mockBoards = [];
    render(<BoardPage />);
    expect(screen.getByTestId('board-switcher')).toBeInTheDocument();
  });

  it('passes the resolved board and project down to the switcher', () => {
    mockBoards = [
      buildBoard({ id: 'b1', name: 'Engineering', isDefault: true }),
      buildBoard({ id: 'b2', name: 'Design', isDefault: false }),
    ];
    render(<BoardPage />);

    const switcher = screen.getByTestId('board-switcher');
    expect(switcher).toHaveAttribute('data-project-key', 'PROJ');
    expect(switcher).toHaveAttribute('data-board-id', 'b1');
    expect(switcher).toHaveTextContent('Engineering');
  });
});
