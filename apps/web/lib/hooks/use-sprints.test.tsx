import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestWrapper } from '@/test/test-utils';

vi.mock('@/lib/api/boards.api', () => ({
  sprintsApi: {
    list: vi.fn(),
    getBacklog: vi.fn(),
    getBurndown: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    delete: vi.fn(),
    addIssues: vi.fn(),
    removeIssues: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Must also mock use-boards since use-sprints imports boardKeys from it
vi.mock('./use-boards', () => ({
  boardKeys: {
    all: ['boards'],
  },
}));

import { sprintsApi } from '@/lib/api/boards.api';
import { useSprints, useCreateSprint, useStartSprint, useCloseSprint, useDeleteSprint } from './use-sprints';

describe('useSprints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches sprints for board', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(sprintsApi.list).mockResolvedValue({ data: { items: [{ id: 's1' }] } } as any);

    const { result } = renderHook(() => useSprints('b1', 'ACTIVE'), { wrapper: TestWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(sprintsApi.list).toHaveBeenCalledWith('b1', 'ACTIVE');
  });

  it('does not fetch when boardId is empty', () => {
    renderHook(() => useSprints(''), { wrapper: TestWrapper });
    expect(sprintsApi.list).not.toHaveBeenCalled();
  });
});

describe('useCreateSprint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates sprint and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(sprintsApi.create).mockResolvedValue({ data: { id: 's1' } } as any);

    const { result } = renderHook(() => useCreateSprint('b1'), { wrapper: TestWrapper });

    result.current.mutate({ name: 'Sprint 1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Sprint created');
  });
});

describe('useStartSprint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts sprint and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(sprintsApi.start).mockResolvedValue({ data: {} } as any);

    const { result } = renderHook(() => useStartSprint('b1'), { wrapper: TestWrapper });

    result.current.mutate({ sprintId: 's1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Sprint started');
  });
});

describe('useCloseSprint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('closes sprint and shows summary toast', async () => {
    const { toast } = await import('sonner');
    vi.mocked(sprintsApi.close).mockResolvedValue({
      data: { completedIssues: 5, velocityPoints: 13 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useCloseSprint('b1'), { wrapper: TestWrapper });

    result.current.mutate({
      sprintId: 's1',
      data: { incompleteIssuesAction: 'MOVE_TO_BACKLOG' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith(
      'Sprint closed — 5 issues completed, velocity: 13 pts',
    );
  });
});

describe('useDeleteSprint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes sprint and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(sprintsApi.delete).mockResolvedValue({} as any);

    const { result } = renderHook(() => useDeleteSprint('b1'), { wrapper: TestWrapper });

    result.current.mutate('s1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Sprint deleted');
  });
});
