import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestWrapper } from '@/test/test-utils';

vi.mock('@/lib/api/notifications.api', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    delete: vi.fn(),
    getPreferences: vi.fn(),
    channelOptions: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { notificationsApi } from '@/lib/api/notifications.api';
import { useUnreadCount, useMarkAsRead, useMarkAllAsRead, useUpdatePreferences } from './use-notifications';

describe('useUnreadCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches unread count', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ data: { count: 5 } } as any);

    const { result } = renderHook(() => useUnreadCount(), { wrapper: TestWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5);
  });
});

describe('useMarkAsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks notifications as read', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(notificationsApi.markAsRead).mockResolvedValue({} as any);

    const { result } = renderHook(() => useMarkAsRead(), { wrapper: TestWrapper });

    result.current.mutate(['n1', 'n2']);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsApi.markAsRead).toHaveBeenCalledWith(['n1', 'n2']);
  });
});

describe('useMarkAllAsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks all as read and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(notificationsApi.markAllAsRead).mockResolvedValue({} as any);

    const { result } = renderHook(() => useMarkAllAsRead(), { wrapper: TestWrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('All notifications marked as read');
  });
});

describe('useUpdatePreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates preferences and shows toast', async () => {
    const { toast } = await import('sonner');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(notificationsApi.updatePreferences).mockResolvedValue({} as any);

    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: TestWrapper });

    result.current.mutate({ emailMode: 'DIGEST' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Preferences saved');
  });

  it('sets error state on failure', async () => {
    vi.mocked(notificationsApi.updatePreferences).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: TestWrapper });

    result.current.mutate({ emailMode: 'INSTANT' });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
