import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestWrapper } from '@/test/test-utils';
import { buildIssueListItem } from '@/test/factories';

vi.mock('@/lib/api/issues.api', () => ({
  issuesApi: {
    list: vi.fn(),
    getByNumber: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getActivities: vi.fn(),
    getChildren: vi.fn(),
    watch: vi.fn(),
    unwatch: vi.fn(),
    bulkUpdate: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { issuesApi } from '@/lib/api/issues.api';
import { useIssues, useIssue, useCreateIssue, useDeleteIssue, useBulkUpdateIssues, useToggleWatch } from './use-issues';

describe('useIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches issues list', async () => {
    const items = [buildIssueListItem()];
    const cursorResponse = {
      items,
      meta: { nextCursor: null, pageSize: 25, hasNextPage: false },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.list).mockResolvedValue({ data: cursorResponse } as any);

    const { result } = renderHook(
      () => useIssues({ projectKey: 'PROJ' }),
      { wrapper: TestWrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toHaveLength(1);
    expect(issuesApi.list).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'PROJ' }));
  });
});

describe('useIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when projectKey is empty', () => {
    renderHook(() => useIssue('', 0), { wrapper: TestWrapper });
    expect(issuesApi.getByNumber).not.toHaveBeenCalled();
  });

  it('fetches when projectKey and number are provided', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.getByNumber).mockResolvedValue({ data: {} } as any);

    const { result } = renderHook(() => useIssue('PROJ', 1), { wrapper: TestWrapper });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(issuesApi.getByNumber).toHaveBeenCalledWith('PROJ', 1);
  });
});

describe('useCreateIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls create and shows toast on success', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.create).mockResolvedValue({ data: { number: 42 } } as any);

    const { result } = renderHook(() => useCreateIssue('PROJ'), { wrapper: TestWrapper });

    result.current.mutate({ title: 'Test' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(issuesApi.create).toHaveBeenCalledWith('PROJ', { title: 'Test' });
    expect(toast.success).toHaveBeenCalledWith('PROJ-42 created');
  });

  it('sets error state on failure', async () => {
    vi.mocked(issuesApi.create).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCreateIssue('PROJ'), { wrapper: TestWrapper });

    result.current.mutate({ title: 'Test' });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDeleteIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls delete and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.delete).mockResolvedValue({} as any);

    const { result } = renderHook(() => useDeleteIssue(), { wrapper: TestWrapper });

    result.current.mutate({ projectKey: 'PROJ', issueNumber: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(issuesApi.delete).toHaveBeenCalledWith('PROJ', 5);
    expect(toast.success).toHaveBeenCalledWith('Issue deleted');
  });
});

describe('useBulkUpdateIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulkUpdate and shows count toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.bulkUpdate).mockResolvedValue({} as any);

    const { result } = renderHook(() => useBulkUpdateIssues(), { wrapper: TestWrapper });

    result.current.mutate({ projectKey: 'PROJ', issueIds: ['1', '2'], update: { priority: 'HIGH' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('2 issues updated');
  });
});

describe('useToggleWatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls watch when not watching', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.watch).mockResolvedValue({} as any);

    const { result } = renderHook(() => useToggleWatch(), { wrapper: TestWrapper });

    result.current.mutate({ projectKey: 'PROJ', issueNumber: 5, isWatching: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(issuesApi.watch).toHaveBeenCalledWith('PROJ', 5);
  });

  it('calls unwatch when watching', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(issuesApi.unwatch).mockResolvedValue({} as any);

    const { result } = renderHook(() => useToggleWatch(), { wrapper: TestWrapper });

    result.current.mutate({ projectKey: 'PROJ', issueNumber: 5, isWatching: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(issuesApi.unwatch).toHaveBeenCalledWith('PROJ', 5);
  });
});
