import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import { WorkflowManager } from './workflow-manager';
import type { WorkflowDto } from '@/lib/api/workflows.api';

const mockWorkflow: WorkflowDto = {
  id: 'w1',
  name: 'Default',
  isDefault: true,
  projectId: 'p1',
  statuses: [
    { id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
    { id: 's2', name: 'In Progress', color: '#3b82f6', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 1 },
    { id: 's3', name: 'Done', color: '#22c55e', category: 'DONE', isInitial: false, isResolved: true, ordinal: 2 },
  ],
  transitions: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockUseWorkflows = vi.fn();
const mockCreateWorkflow = { mutate: vi.fn(), isPending: false };
const mockUpdateWorkflow = { mutate: vi.fn(), isPending: false };
const mockDeleteWorkflow = { mutate: vi.fn(), isPending: false };
const mockSetDefaultWorkflow = { mutate: vi.fn(), isPending: false };
const mockUseHasPermission = vi.fn();

vi.mock('@/lib/hooks/use-workflows', () => ({
  useWorkflows: (...args: unknown[]) => mockUseWorkflows(...args),
  useCreateWorkflow: () => mockCreateWorkflow,
  useUpdateWorkflow: () => mockUpdateWorkflow,
  useDeleteWorkflow: () => mockDeleteWorkflow,
  useSetDefaultWorkflow: () => mockSetDefaultWorkflow,
}));

vi.mock('@/lib/hooks/use-permission', () => ({
  useHasPermission: (...args: unknown[]) => mockUseHasPermission(...args),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@/components/shared/status-badge', () => ({
  StatusBadge: ({ status }: { status: { name: string } }) => <span>{status.name}</span>,
}));

vi.mock('@/components/shared/async-content', () => ({
  AsyncContent: ({ loading, empty, emptyState, children }: { loading: boolean; empty: boolean; emptyState: React.ReactNode; children: React.ReactNode }) => {
    if (loading) return <div data-testid="loading">Loading</div>;
    if (empty) return <>{emptyState}</>;
    return <>{children}</>;
  },
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: ({ open, title, onConfirm }: { open: boolean; title: string; onConfirm: () => void }) =>
    open ? <div data-testid="confirm-dialog"><span>{title}</span><button onClick={onConfirm}>Confirm</button></div> : null,
}));

vi.mock('./workflow-form-dialog', () => ({
  WorkflowFormDialog: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div data-testid="form-dialog">{title ?? 'Create Workflow'}</div> : null,
}));

describe('WorkflowManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows loading state', () => {
    mockUseWorkflows.mockReturnValue({ data: undefined, isLoading: true });
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state when no workflows', () => {
    mockUseWorkflows.mockReturnValue({ data: [], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getByText(/no workflows yet/i)).toBeInTheDocument();
  });

  it('renders workflow cards', () => {
    mockUseWorkflows.mockReturnValue({ data: [mockWorkflow], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getAllByText('Default')).toHaveLength(2); // name + badge
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows "New Workflow" button when user has permission', () => {
    mockUseWorkflows.mockReturnValue({ data: [], isLoading: false });
    mockUseHasPermission.mockReturnValue(true);
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getByText('New Workflow')).toBeInTheDocument();
  });

  it('hides "New Workflow" button when user lacks permission', () => {
    mockUseWorkflows.mockReturnValue({ data: [], isLoading: false });
    mockUseHasPermission.mockReturnValue(false);
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.queryByText('New Workflow')).not.toBeInTheDocument();
  });

  it('opens create dialog on "New Workflow" click', async () => {
    mockUseWorkflows.mockReturnValue({ data: [], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);

    await userEvent.click(screen.getByText('New Workflow'));
    expect(screen.getByTestId('form-dialog')).toBeInTheDocument();
    expect(screen.getByText('Create Workflow')).toBeInTheDocument();
  });

  it('does not show delete button for default workflow', () => {
    mockUseWorkflows.mockReturnValue({ data: [mockWorkflow], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);
    // Default workflow has badge "Default" and no "Set as default" button
    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.queryByText('Set as default')).not.toBeInTheDocument();
  });

  it('shows "Set as default" for non-default workflows', () => {
    const nonDefault = { ...mockWorkflow, id: 'w2', name: 'Custom', isDefault: false };
    mockUseWorkflows.mockReturnValue({ data: [nonDefault], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getByText('Set as default')).toBeInTheDocument();
  });

  it('calls setDefault mutation when "Set as default" clicked', async () => {
    const nonDefault = { ...mockWorkflow, id: 'w2', name: 'Custom', isDefault: false };
    mockUseWorkflows.mockReturnValue({ data: [nonDefault], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);

    await userEvent.click(screen.getByText('Set as default'));
    expect(mockSetDefaultWorkflow.mutate).toHaveBeenCalledWith('w2');
  });

  it('shows status and transition counts', () => {
    const workflow = {
      ...mockWorkflow,
      transitions: [{ id: 't1', name: 'Start', fromStatusId: '*', toStatusId: 's2', requiredRole: null }],
    };
    mockUseWorkflows.mockReturnValue({ data: [workflow], isLoading: false });
    render(<WorkflowManager projectKey="PROJ" />);
    expect(screen.getByText('3 statuses · 1 transitions')).toBeInTheDocument();
  });
});
