import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/test-utils';
import { BoardSettingsDialog } from './board-settings-dialog';
import type { Board } from '@/lib/api/boards.api';

const updateBoardMutate = vi.fn().mockResolvedValue(undefined);
const updateColumnsMutate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/hooks/use-boards', () => ({
  useUpdateBoard: () => ({ mutateAsync: updateBoardMutate, isPending: false }),
  useUpdateBoardColumns: () => ({ mutateAsync: updateColumnsMutate, isPending: false }),
}));

vi.mock('@/lib/hooks/use-projects', () => ({
  useWorkflowStatuses: () => ({
    data: [
      { id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
      { id: 's2', name: 'In Progress', color: '#3b82f6', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 1 },
    ],
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} type={type} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...rest}>{children}</label>
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (v: boolean) => void }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({
    children,
    render: renderProp,
    ...props
  }: {
    children?: React.ReactNode;
    render?: React.ReactElement;
    [key: string]: unknown;
  }) => {
    const El = (renderProp as React.ReactElement | undefined)?.type ?? 'button';
    const elProps = (renderProp as React.ReactElement | undefined)?.props ?? {};
    return (
      <El {...elProps} {...props}>
        {children}
      </El>
    );
  },
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock('@/components/shared/status-badge', () => ({
  StatusBadge: ({ status }: { status: { name: string } }) => <span>{status.name}</span>,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
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

const board: Board = {
  id: 'b1',
  projectId: 'p1',
  name: 'Board',
  type: 'KANBAN',
  columns: [
    { id: 'c1', name: 'To Do', statusIds: ['s1', 's2'], ordinal: 0 },
  ],
  swimlaneBy: 'NONE',
  filterQuery: null,
  autoCloseOnDone: false,
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  updateBoardMutate.mockClear();
  updateColumnsMutate.mockClear();
});

describe('BoardSettingsDialog', () => {
  it('adds an empty column without an error toast', async () => {
    render(<BoardSettingsDialog open onOpenChange={vi.fn()} projectKey="P" board={board} />);
    await userEvent.click(screen.getByRole('button', { name: /add column/i }));
    expect(screen.getAllByRole('button', { name: /no statuses|status/i }).length).toBeGreaterThan(0);
  });

  it('drops empty columns from the save payload', async () => {
    render(<BoardSettingsDialog open onOpenChange={vi.fn()} projectKey="P" board={board} />);
    await userEvent.click(screen.getByRole('button', { name: /add column/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(updateColumnsMutate).toHaveBeenCalledTimes(1));
    // Board update must be awaited before columns persist (no half-applied save).
    expect(updateBoardMutate).toHaveBeenCalledTimes(1);
    const payload = updateColumnsMutate.mock.calls[0]![0] as { columns: Array<{ id: string }> };
    expect(payload.columns).toHaveLength(1);
    expect(payload.columns[0]!.id).toBe('c1');
  });

  it('disables Save when a workflow status is not covered by any column', () => {
    const partialBoard: Board = {
      ...board,
      columns: [
        { id: 'c1', name: 'To Do', statusIds: ['s1'], ordinal: 0 },
      ],
    };
    render(<BoardSettingsDialog open onOpenChange={vi.fn()} projectKey="P" board={partialBoard} />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('renders DndContext and grip handles for dnd wiring', () => {
    render(<BoardSettingsDialog open onOpenChange={vi.fn()} projectKey="P" board={board} />);
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    const gripHandles = document.querySelectorAll('.cursor-grab');
    expect(gripHandles.length).toBeGreaterThanOrEqual(board.columns.length);
  });
});
