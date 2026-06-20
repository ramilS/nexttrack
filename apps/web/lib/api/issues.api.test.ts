import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issuesApi } from './issues.api';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from './client';

describe('issuesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list sends GET with params', async () => {
    await issuesApi.list({ projectKey: 'PROJ', pageSize: 25, status: 'TODO' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/projects/PROJ/issues',
      { params: expect.objectContaining({ pageSize: 25, status: 'TODO', projectKey: undefined }) },
    );
  });

  it('getByNumber sends GET with project key and number', async () => {
    await issuesApi.getByNumber('PROJ', 42);
    expect(apiClient.get).toHaveBeenCalledWith('/projects/PROJ/issues/42');
  });

  it('create sends POST with data', async () => {
    const data = { title: 'New Issue' };
    await issuesApi.create('PROJ', data);
    expect(apiClient.post).toHaveBeenCalledWith('/projects/PROJ/issues', data);
  });

  it('update sends PATCH to project-scoped route', async () => {
    const data = { title: 'Updated' };
    await issuesApi.update('PROJ', 5, data);
    expect(apiClient.patch).toHaveBeenCalledWith('/projects/PROJ/issues/5', data);
  });

  it('delete sends DELETE to project-scoped route', async () => {
    await issuesApi.delete('PROJ', 5);
    expect(apiClient.delete).toHaveBeenCalledWith('/projects/PROJ/issues/5');
  });

  it('restore sends POST to project-scoped route', async () => {
    await issuesApi.restore('PROJ', 5);
    expect(apiClient.post).toHaveBeenCalledWith('/projects/PROJ/issues/5/restore');
  });

  it('getChildren sends GET to project-scoped route', async () => {
    await issuesApi.getChildren('PROJ', 5);
    expect(apiClient.get).toHaveBeenCalledWith('/projects/PROJ/issues/5/children');
  });

  it('getActivities sends GET with params', async () => {
    await issuesApi.getActivities('WEB', 5, { cursor: 'abc', pageSize: 10 });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/projects/WEB/issues/5/activities',
      { params: { cursor: 'abc', pageSize: 10 } },
    );
  });

  it('watch sends POST to watchers endpoint', async () => {
    await issuesApi.watch('PROJ', 5);
    expect(apiClient.post).toHaveBeenCalledWith('/projects/PROJ/issues/5/watchers');
  });

  it('unwatch sends DELETE to watchers endpoint', async () => {
    await issuesApi.unwatch('PROJ', 5);
    expect(apiClient.delete).toHaveBeenCalledWith('/projects/PROJ/issues/5/watchers');
  });

  it('bulkUpdate sends PATCH to project-scoped bulk route', async () => {
    const data = { issueIds: ['1', '2'], update: { priority: 'HIGH' as const } };
    await issuesApi.bulkUpdate('PROJ', data);
    expect(apiClient.patch).toHaveBeenCalledWith('/projects/PROJ/issues/bulk', data);
  });
});
