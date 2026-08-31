import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import type { BoardSummary } from '@/lib/api/boards.api';
import { BoardSwitcher } from './board-switcher';

const mockPush = vi.fn();
let mockVisibleBoards: { data: BoardSummary[] | undefined; isLoading: boolean };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/hooks/use-boards', () => ({
  useVisibleBoards: () => mockVisibleBoards,
}));

function buildSummary(overrides: Partial<BoardSummary> = {}): BoardSummary {
  return {
    id: 'board-1',
    name: 'Engineering',
    type: 'KANBAN',
    project: {
      id: '00000000-0000-4000-8000-000000000010',
      key: 'PROJ',
      name: 'Platform',
    },
    ...overrides,
  };
}

// Named so it shares no letters with its project key: a search for "OPS" can
// only reach it through the project key baked into the item's search value.
const otherProjectBoard = buildSummary({
  id: 'board-9',
  name: 'Delivery',
  project: {
    id: '00000000-0000-4000-8000-000000000099',
    key: 'OPS',
    name: 'Operations',
  },
});

function renderSwitcher(onSelectInProject = vi.fn()) {
  render(
    <BoardSwitcher
      projectKey="PROJ"
      currentBoardId="board-1"
      currentBoardName="Engineering"
      onSelectInProject={onSelectInProject}
    />,
  );
  return { onSelectInProject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVisibleBoards = {
    data: [buildSummary(), buildSummary({ id: 'board-2', name: 'Design' }), otherProjectBoard],
    isLoading: false,
  };
});

describe('BoardSwitcher', () => {
  it('shows the current board name on the trigger without opening the list', () => {
    renderSwitcher();
    expect(screen.getByRole('button', { name: 'Switch board' })).toHaveTextContent(
      'Engineering',
    );
  });

  it('falls back to a placeholder when no board is selected yet', () => {
    render(
      <BoardSwitcher
        projectKey="PROJ"
        currentBoardId={undefined}
        currentBoardName={undefined}
        onSelectInProject={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Switch board' })).toHaveTextContent(
      'Select board',
    );
  });

  it('groups boards by project, current project first', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Switch board' }));

    const current = screen.getByText('Platform (current)');
    const other = screen.getByText('Operations');

    // DOCUMENT_POSITION_FOLLOWING: the other project's heading comes after the
    // current one, whatever the API returned them in.
    expect(current.compareDocumentPosition(other)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('switches within the current project without navigating', async () => {
    const { onSelectInProject } = renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Switch board' }));
    await userEvent.click(screen.getByText('Design'));

    expect(onSelectInProject).toHaveBeenCalledWith('board-2');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to the other project's board page, carrying the board id", async () => {
    const { onSelectInProject } = renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Switch board' }));
    await userEvent.click(screen.getByText('Delivery'));

    expect(mockPush).toHaveBeenCalledWith('/projects/OPS/board?board=board-9');
    expect(onSelectInProject).not.toHaveBeenCalled();
  });

  it('finds a board by its project key even when the name cannot match', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Switch board' }));
    await userEvent.type(screen.getByPlaceholderText('Search boards...'), 'OPS');

    expect(screen.getByText('Delivery')).toBeInTheDocument();
  });

  it('reports an empty roster instead of rendering an empty popup', async () => {
    mockVisibleBoards = { data: [], isLoading: false };
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Switch board' }));

    expect(screen.getByText('No boards available.')).toBeInTheDocument();
  });
});
