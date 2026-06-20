import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationsApi } from './notifications.api';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from './client';

describe('notificationsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list sends GET with params', async () => {
    await notificationsApi.list({ pageSize: 20, isRead: false });
    expect(apiClient.get).toHaveBeenCalledWith('/notifications', { params: { pageSize: 20, isRead: false } });
  });

  it('unreadCount sends GET', async () => {
    await notificationsApi.unreadCount();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('markAsRead sends PATCH with ids', async () => {
    await notificationsApi.markAsRead(['n1', 'n2']);
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read', { notificationIds: ['n1', 'n2'] });
  });

  it('markAllAsRead sends PATCH', async () => {
    await notificationsApi.markAllAsRead();
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('delete sends DELETE', async () => {
    await notificationsApi.delete('n1');
    expect(apiClient.delete).toHaveBeenCalledWith('/notifications/n1');
  });

  it('channelOptions sends GET', async () => {
    await notificationsApi.channelOptions();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/channel-options');
  });

  it('getPreferences sends GET', async () => {
    await notificationsApi.getPreferences();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/preferences');
  });

  it('updatePreferences sends PATCH with data', async () => {
    const data = { emailMode: 'DIGEST' as const };
    await notificationsApi.updatePreferences(data);
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/preferences', data);
  });
});
