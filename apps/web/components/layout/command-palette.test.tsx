import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, act } from '@/test/test-utils';
import { CommandPalette } from './command-palette';
import { useCreateIssueStore } from '@/lib/stores/create-issue.store';
import { useCreateBoardStore } from '@/lib/stores/create-board.store';
import { useCommandContextStore } from '@/lib/stores/command-context.store';

let mockRouteParams: { key?: string };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => mockRouteParams,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-quick-search', () => ({
  useQuickSearch: () => ({ query: '', setQuery: vi.fn(), results: [], isLoading: false }),
}));

vi.mock('@/lib/hooks/use-projects', () => ({
  useProjects: () => ({ data: { items: [] } }),
  useWorkflowStatuses: () => ({ data: [] }),
  useProjectMembers: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('@/lib/stores/command-palette.store', () => ({
  useCommandPaletteStore: (selector: (s: unknown) => unknown) =>
    selector({ isOpen: true, close: vi.fn(), toggle: vi.fn() }),
}));

vi.mock('@/lib/stores/sidebar.store', () => ({
  useSidebarStore: (selector: (s: unknown) => unknown) => selector({ isCollapsed: false }),
}));

vi.mock('@/lib/stores/create-sprint.store', () => ({
  useCreateSprintStore: (selector: (s: unknown) => unknown) =>
    selector({ activeBoardId: null, open: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement scrollIntoView, which cmdk calls on mount.
  Element.prototype.scrollIntoView = vi.fn();
  useCreateIssueStore.setState({ isOpen: false, projectKey: null, defaults: null });
  useCreateBoardStore.setState({ isOpen: false, projectKey: null });
  act(() => useCommandContextStore.getState().clearContext());
});

describe('CommandPalette — create issue default project', () => {
  it('pre-fills the project from the current route when opening create issue', async () => {
    mockRouteParams = { key: 'ABC' };
    render(<CommandPalette />);

    await userEvent.click(screen.getByText('Create new issue'));

    expect(useCreateIssueStore.getState().projectKey).toBe('ABC');
  });

  it('leaves the project unset when not on a project route', async () => {
    mockRouteParams = {};
    render(<CommandPalette />);

    await userEvent.click(screen.getByText('Create new issue'));

    expect(useCreateIssueStore.getState().projectKey).toBeNull();
  });

  it('offers create swimlane on a project route, pre-filling project and STORY type', async () => {
    mockRouteParams = { key: 'ABC' };
    render(<CommandPalette />);

    await userEvent.click(screen.getByText('Create new swimlane (Story)'));

    const state = useCreateIssueStore.getState();
    expect(state.projectKey).toBe('ABC');
    expect(state.defaults).toEqual({ type: 'STORY' });
  });

  it('hides create swimlane when not on a project route', () => {
    mockRouteParams = {};
    render(<CommandPalette />);

    expect(screen.queryByText('Create new swimlane (Story)')).not.toBeInTheDocument();
  });

  it('offers create board on a project route, pre-filling the project', async () => {
    mockRouteParams = { key: 'ABC' };
    render(<CommandPalette />);

    await userEvent.click(screen.getByText('Create new board'));

    const state = useCreateBoardStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.projectKey).toBe('ABC');
  });

  it('hides create board when not on a project route', () => {
    mockRouteParams = {};
    render(<CommandPalette />);

    expect(screen.queryByText('Create new board')).not.toBeInTheDocument();
  });

  it('shows issue actions when the command-context store has a selection', () => {
    mockRouteParams = { key: 'ABC' };
    act(() =>
      useCommandContextStore.getState().setContext({
        activeIssue: null,
        selectedIssueIds: ['issue-1'],
        currentProject: { key: 'ABC', id: 'p1' },
        currentUser: null,
      }),
    );
    render(<CommandPalette />);

    expect(screen.getByText('Set Priority')).toBeInTheDocument();
  });

  it('hides issue actions when there is no active issue or selection', () => {
    mockRouteParams = { key: 'ABC' };
    render(<CommandPalette />);

    expect(screen.queryByText('Set Priority')).not.toBeInTheDocument();
  });
});
