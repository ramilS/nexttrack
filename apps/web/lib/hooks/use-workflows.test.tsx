import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestWrapper } from '@/test/test-utils';

vi.mock('@/lib/api/workflows.api', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setDefault: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { workflowsApi } from '@/lib/api/workflows.api';
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useSetDefaultWorkflow,
} from './use-workflows';

describe('useWorkflows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches workflows for project', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue({
      data: [{ id: 'w1', name: 'Default' }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useWorkflows('PROJ'), { wrapper: TestWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(workflowsApi.list).toHaveBeenCalledWith('PROJ');
  });

  it('does not fetch when projectKey is empty', () => {
    renderHook(() => useWorkflows(''), { wrapper: TestWrapper });
    expect(workflowsApi.list).not.toHaveBeenCalled();
  });
});

describe('useCreateWorkflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates workflow and shows toast', async () => {
    const { toast } = await import('sonner');
    vi.mocked(workflowsApi.create).mockResolvedValue({
      data: { id: 'w1', name: 'My Workflow' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useCreateWorkflow('PROJ'), { wrapper: TestWrapper });

    result.current.mutate({
      name: 'My Workflow',
      statuses: [{ name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Workflow created');
  });
});

describe('useUpdateWorkflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates workflow and shows toast', async () => {
    const { toast } = await import('sonner');
    vi.mocked(workflowsApi.update).mockResolvedValue({
      data: { id: 'w1', name: 'Updated' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useUpdateWorkflow('PROJ'), { wrapper: TestWrapper });

    result.current.mutate({
      id: 'w1',
      data: {
        name: 'Updated',
        statuses: [{ id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 }],
        transitions: [],
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Workflow updated');
  });
});

describe('useSetDefaultWorkflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets default workflow and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(workflowsApi.setDefault).mockResolvedValue({ data: { id: 'w1' } } as any);

    const { result } = renderHook(() => useSetDefaultWorkflow('PROJ'), { wrapper: TestWrapper });

    result.current.mutate('w1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Default workflow updated');
  });
});

describe('useDeleteWorkflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes workflow and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(workflowsApi.delete).mockResolvedValue({} as any);

    const { result } = renderHook(() => useDeleteWorkflow('PROJ'), { wrapper: TestWrapper });

    result.current.mutate('w1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Workflow deleted');
  });
});
