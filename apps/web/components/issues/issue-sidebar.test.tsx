import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen, userEvent } from '@/test/test-utils';
import { buildIssueDto, buildProjectMember, buildUser, resetFactoryCounter } from '@/test/factories';
import { IssueSidebar } from './issue-sidebar';
import type { ProjectMember } from '@repo/shared/schemas';

const mockMembers: ProjectMember[] = [];
const mockCurrentUser = buildUser({ id: 'me-1', name: 'Alice Current' });

vi.mock('@/lib/hooks/use-projects', () => ({
  useProjectMembers: () => ({ data: mockMembers, isLoading: false }),
  useWorkflowStatuses: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/use-auth', () => ({
  useCurrentUser: () => ({ data: mockCurrentUser }),
}));

const mockMutate = vi.fn();
vi.mock('@/lib/hooks/use-issues', () => ({
  useUpdateIssue: () => ({ mutate: mockMutate }),
  useToggleWatch: () => ({ mutate: vi.fn() }),
  useIssueChildren: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/use-custom-fields', () => ({
  useCustomFields: () => ({ data: [] }),
  useIssueFieldValues: () => ({ data: [] }),
  useSetFieldValue: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-mute-notifications', () => ({
  useMuteIssue: () => ({ isMuted: () => false, toggleMute: { mutate: vi.fn() } }),
}));

vi.mock('@/lib/hooks/use-tags', () => ({
  useTags: () => ({ data: [] }),
  useAddTagToIssue: () => ({ mutate: vi.fn() }),
  useRemoveTagFromIssue: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-boards', () => ({
  useBoards: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/use-sprints', () => ({
  useSprints: () => ({ data: [] }),
}));

vi.mock('@/components/custom-fields/field-renderer', () => ({
  FieldRenderer: () => null,
}));

vi.mock('@/components/time-tracking/timer-button', () => ({
  TimerButton: () => <div data-testid="timer-button" />,
}));

vi.mock('@/components/time-tracking/time-logs-list', () => ({
  TimeLogsList: () => <div data-testid="time-logs-list" />,
}));

vi.mock('@/lib/hooks/use-teams', () => ({
  useTeams: () => ({ data: [], isLoading: false }),
}));

// Inline Popover mock (no portal) so content is always visible in tests
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children?: React.ReactNode | (() => React.ReactNode); open?: boolean }) => {
    return <div data-open={open}>{typeof children === 'function' ? children() : children}</div>;
  },
  PopoverTrigger: ({ children, render, ...props }: { children?: React.ReactNode; render?: React.ReactElement; [key: string]: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const El = (render as any)?.type || 'button';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <El {...(render as any)?.props} {...props}>{children}</El>;
  },
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Avatar to keep things simple
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children?: React.ReactNode; className?: string }) => <span className={className}>{children}</span>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

describe('IssueSidebar — Assignee Picker', () => {
  const memberAlice = buildProjectMember({ user: { id: 'me-1', name: 'Alice Current', email: 'alice@test.com', avatarUrl: null } });
  const memberBob = buildProjectMember({ user: { id: 'bob-1', name: 'Bob Developer', email: 'bob@test.com', avatarUrl: null } });
  const memberCharlie = buildProjectMember({ user: { id: 'charlie-1', name: 'Charlie Tester', email: 'charlie@test.com', avatarUrl: null } });

  beforeEach(() => {
    resetFactoryCounter();
    mockMutate.mockClear();
    mockMembers.length = 0;
    mockMembers.push(memberBob, memberCharlie, memberAlice);
  });

  it('shows "Unassigned" when no assignee is set', () => {
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows assigned user name in trigger', () => {
    const issue = buildIssueDto({
      assignee: { id: 'bob-1', name: 'Bob Developer', email: 'bob@test.com', avatarUrl: null },
    });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    // Assignee name appears in trigger (from issue.assignee) and in member list
    const matches = screen.getAllByText('Bob Developer');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // First match is in the trigger with truncate class
    expect(matches[0]!.closest('button')).toBeTruthy();
  });

  it('renders all project members in the dropdown', () => {
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    expect(screen.getByText('Alice Current')).toBeInTheDocument();
    expect(screen.getByText('Bob Developer')).toBeInTheDocument();
    expect(screen.getByText('Charlie Tester')).toBeInTheDocument();
  });

  it('puts current user first in the list', () => {
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    const buttons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent?.includes('Alice Current') || btn.textContent?.includes('Bob Developer') || btn.textContent?.includes('Charlie Tester'),
    );

    expect(buttons[0]?.textContent).toContain('Alice Current');
  });

  it('marks current user with "(me)" label', () => {
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    expect(screen.getByText('(me)')).toBeInTheDocument();
  });

  it('calls updateIssue with assigneeId on member click', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByText('Bob Developer'));

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { assigneeId: 'bob-1' },
    });
  });

  it('shows "Unassign" button when someone is assigned', () => {
    const issue = buildIssueDto({
      assignee: { id: 'bob-1', name: 'Bob Developer', email: 'bob@test.com', avatarUrl: null },
    });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    expect(screen.getByText('Unassign')).toBeInTheDocument();
  });

  it('calls updateIssue with null assigneeId on Unassign click', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({
      assignee: { id: 'bob-1', name: 'Bob Developer', email: 'bob@test.com', avatarUrl: null },
    });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByText('Unassign'));

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { assigneeId: null },
    });
  });

  it('filters members by search input', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    const searchInput = screen.getByPlaceholderText('Search members...');
    await user.type(searchInput, 'bob');

    expect(screen.getByText('Bob Developer')).toBeInTheDocument();
    expect(screen.queryByText('Alice Current')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Tester')).not.toBeInTheDocument();
  });

  it('shows "No members found" when search has no matches', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ assignee: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    const searchInput = screen.getByPlaceholderText('Search members...');
    await user.type(searchInput, 'zzzznotexist');

    expect(screen.getByText('No members found')).toBeInTheDocument();
  });

  it('highlights currently assigned member with check icon', () => {
    const issue = buildIssueDto({
      assignee: { id: 'bob-1', name: 'Bob Developer', email: 'bob@test.com', avatarUrl: null },
    });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    // Bob's button should have bg-accent class
    const bobButton = screen.getAllByRole('button').find(
      (btn) => btn.textContent?.includes('Bob Developer') && btn.className.includes('bg-accent'),
    );
    expect(bobButton).toBeDefined();
  });
});

describe('IssueSidebar — Due date', () => {
  beforeEach(() => {
    resetFactoryCounter();
    mockMutate.mockClear();
  });

  it('sends a full midnight-UTC ISO datetime when a day is picked', () => {
    const issue = buildIssueDto({ dueDate: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-07-15' } });

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { dueDate: '2026-07-15T00:00:00.000Z' },
    });
  });

  it('sends null when the due date is cleared', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ dueDate: '2026-07-15T00:00:00.000Z' });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByLabelText('Clear due date'));

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { dueDate: null },
    });
  });

  it('renders the stored day in UTC regardless of local timezone', () => {
    const issue = buildIssueDto({ dueDate: '2026-07-15T00:00:00.000Z' });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
      .format(new Date('2026-07-15T00:00:00.000Z'));
    expect(screen.getByTestId('issue-due-date')).toHaveTextContent(expected);
  });
});

describe('IssueSidebar — Estimate', () => {
  beforeEach(() => {
    resetFactoryCounter();
    mockMutate.mockClear();
  });

  it('parses a duration string into minutes on Enter', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ estimate: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByTestId('issue-estimate'));
    await user.type(screen.getByLabelText('Estimate'), '2h 30m');
    await user.keyboard('{Enter}');

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { estimate: 150 },
    });
  });

  it('sends null when the estimate is emptied', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ estimate: 150 });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByTestId('issue-estimate'));
    await user.clear(screen.getByLabelText('Estimate'));
    await user.keyboard('{Enter}');

    expect(mockMutate).toHaveBeenCalledWith({
      projectKey: 'PROJ',
      issueNumber: issue.number,
      issueId: issue.id,
      data: { estimate: null },
    });
  });

  it('does not submit an unparseable estimate', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ estimate: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByTestId('issue-estimate'));
    await user.type(screen.getByLabelText('Estimate'), 'nonsense');
    await user.keyboard('{Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Estimate')).toBeInTheDocument(); // editor stays open
  });

  it('does not submit an estimate above the max bound', async () => {
    const user = userEvent.setup();
    const issue = buildIssueDto({ estimate: null });
    render(<IssueSidebar issue={issue} projectKey="PROJ" />);

    await user.click(screen.getByTestId('issue-estimate'));
    await user.type(screen.getByLabelText('Estimate'), '200h'); // 12000m > 9999m max
    await user.keyboard('{Enter}');

    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe('IssueSidebar — read-only fallback (no ISSUE_UPDATE)', () => {
  beforeEach(() => {
    resetFactoryCounter();
    mockMutate.mockClear();
  });

  it('renders metadata as plain values with no editable controls', () => {
    const issue = buildIssueDto({
      estimate: 150,
      dueDate: '2026-07-15T00:00:00.000Z',
      tags: [{ id: 'tag-1', name: 'backend', color: 'blue' }],
    });
    render(<IssueSidebar issue={issue} projectKey="PROJ" readOnly />);

    // No interactive field controls
    expect(screen.queryByTestId('issue-due-date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('issue-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('issue-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('issue-priority')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove tag backend')).not.toBeInTheDocument();

    // But values are still shown
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });
});
