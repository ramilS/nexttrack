import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import { WorkflowFormDialog } from './workflow-form-dialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} type={type} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...rest}>{children}</label>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: React.ReactNode; value?: string }) => (
    <div data-testid="select" data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  arrayMove: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

describe('WorkflowFormDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders with create title by default', () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    expect(screen.getByText('Create Workflow')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(<WorkflowFormDialog {...defaultProps} title="Edit Workflow" />);
    expect(screen.getByText('Edit Workflow')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<WorkflowFormDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Create Workflow')).not.toBeInTheDocument();
  });

  it('renders default statuses for new workflow', () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const nameInputs = screen.getAllByPlaceholderText('Status name...');
    expect(nameInputs).toHaveLength(3);
  });

  it('renders name input with placeholder', () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('Workflow name...')).toBeInTheDocument();
  });

  it('disables submit when name is empty', () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const createBtn = screen.getByText('Create');
    expect(createBtn).toBeDisabled();
  });

  it('enables submit when form is valid', async () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('Workflow name...');
    await userEvent.type(nameInput, 'My Workflow');
    const createBtn = screen.getByText('Create');
    expect(createBtn).not.toBeDisabled();
  });

  it('calls onSubmit with form data', async () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('Workflow name...');
    await userEvent.type(nameInput, 'My Workflow');

    const form = nameInput.closest('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Workflow' }),
    );
  });

  it('calls onOpenChange when cancel is clicked', async () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows "Save" button when editing (defaultValues provided)', () => {
    render(
      <WorkflowFormDialog
        {...defaultProps}
        title="Edit Workflow"
        defaultValues={{
          name: 'Existing',
          statuses: [
            { id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
          ],
          transitions: [],
        }}
      />,
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('adds new status when "Add Status" is clicked', async () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const addBtn = screen.getByText('Add Status');
    await userEvent.click(addBtn);
    const nameInputs = screen.getAllByPlaceholderText('Status name...');
    expect(nameInputs).toHaveLength(4);
  });

  it('shows "Add Transition" button', () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    expect(screen.getByText('Add Transition')).toBeInTheDocument();
  });

  it('adds new transition when "Add Transition" is clicked', async () => {
    render(<WorkflowFormDialog {...defaultProps} />);
    const addBtn = screen.getByText('Add Transition');
    await userEvent.click(addBtn);
    expect(screen.getByPlaceholderText('Transition name...')).toBeInTheDocument();
  });

  it('disables submit when isPending', async () => {
    render(<WorkflowFormDialog {...defaultProps} isPending />);
    const nameInput = screen.getByPlaceholderText('Workflow name...');
    await userEvent.type(nameInput, 'My Workflow');
    const createBtn = screen.getByText('Create');
    expect(createBtn).toBeDisabled();
  });

  it('shows initial status validation hint when none is selected', async () => {
    render(
      <WorkflowFormDialog
        {...defaultProps}
        defaultValues={{
          name: 'Test',
          statuses: [
            { id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: false, isResolved: false, ordinal: 0 },
          ],
          transitions: [],
        }}
      />,
    );
    expect(screen.getByText(/one status must be marked as initial/i)).toBeInTheDocument();
  });
});
