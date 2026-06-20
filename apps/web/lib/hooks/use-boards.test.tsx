import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestWrapper } from '@/test/test-utils';

vi.mock('@/lib/api/boards.api', () => ({
  boardsApi: {
    list: vi.fn(),
    get: vi.fn(),
    getData: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateColumns: vi.fn(),
    delete: vi.fn(),
    moveIssue: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { boardsApi } from '@/lib/api/boards.api';
import { useBoards, useBoardData, useCreateBoard, useDeleteBoard, useMoveIssue } from './use-boards';

describe('useBoards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches boards for project', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(boardsApi.list).mockResolvedValue({ data: [{ id: 'b1', name: 'Board' }] } as any);

    const { result } = renderHook(() => useBoards('PROJ'), { wrapper: TestWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('does not fetch when projectKey is empty', () => {
    renderHook(() => useBoards(''), { wrapper: TestWrapper });
    expect(boardsApi.list).not.toHaveBeenCalled();
  });
});

describe('useBoardData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches board data', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(boardsApi.getData).mockResolvedValue({ data: { columns: [] } } as any);

    const { result } = renderHook(
      () => useBoardData('PROJ', 'b1'),
      { wrapper: TestWrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(boardsApi.getData).toHaveBeenCalledWith('PROJ', 'b1', undefined);
  });
});

describe('useCreateBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates board and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(boardsApi.create).mockResolvedValue({ data: { id: 'b1' } } as any);

    const { result } = renderHook(() => useCreateBoard('PROJ'), { wrapper: TestWrapper });

    result.current.mutate({ name: 'New Board' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Board created');
  });
});

describe('useDeleteBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes board and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(boardsApi.delete).mockResolvedValue({} as any);

    const { result } = renderHook(() => useDeleteBoard('PROJ'), { wrapper: TestWrapper });

    result.current.mutate('b1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Board deleted');
  });
});

describe('useMoveIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves issue', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(boardsApi.moveIssue).mockResolvedValue({} as any);

    const { result } = renderHook(() => useMoveIssue('PROJ', 'b1'), { wrapper: TestWrapper });

    result.current.mutate({ issueId: 'i1', toStatusId: 's2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(boardsApi.moveIssue).toHaveBeenCalledWith('PROJ', 'b1', { issueId: 'i1', toStatusId: 's2' });
  });
});
