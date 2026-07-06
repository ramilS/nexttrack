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
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
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

describe('BoardPage — multiple boards', () => {
  it('hides the board switcher with a single board', () => {
    mockBoards = [buildBoard({ id: 'b1' })];
    render(<BoardPage />);
    expect(screen.queryAllByTestId('swimlane-select')).toHaveLength(1);
  });

  it('shows a board switcher when the project has more than one board', () => {
    mockBoards = [
      buildBoard({ id: 'b1', name: 'Engineering', isDefault: true }),
      buildBoard({ id: 'b2', name: 'Design', isDefault: false }),
    ];
    render(<BoardPage />);
    // Both the swimlane select and the board switcher use the mocked Select.
    expect(screen.getAllByTestId('swimlane-select')).toHaveLength(2);
  });
});
