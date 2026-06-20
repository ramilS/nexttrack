import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boardsApi, sprintsApi } from './boards.api';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from './client';

describe('boardsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list sends GET', async () => {
    await boardsApi.list('PROJ');
    expect(apiClient.get).toHaveBeenCalledWith('/projects/PROJ/boards');
  });

  it('get sends GET with boardId', async () => {
    await boardsApi.get('PROJ', 'b1');
    expect(apiClient.get).toHaveBeenCalledWith('/projects/PROJ/boards/b1');
  });

  it('getData sends GET with params', async () => {
    await boardsApi.getData('PROJ', 'b1', { swimlaneBy: 'ASSIGNEE' });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/projects/PROJ/boards/b1/data',
      { params: { swimlaneBy: 'ASSIGNEE' } },
    );
  });

  it('create sends POST', async () => {
    await boardsApi.create('PROJ', { name: 'Board' });
    expect(apiClient.post).toHaveBeenCalledWith('/projects/PROJ/boards', { name: 'Board' });
  });

  it('update sends PATCH', async () => {
    await boardsApi.update('PROJ', 'b1', { name: 'Updated' });
    expect(apiClient.patch).toHaveBeenCalledWith('/projects/PROJ/boards/b1', { name: 'Updated' });
  });

  it('updateColumns sends PUT', async () => {
    const columns = [{ id: 'c1', name: 'Todo', statusIds: ['s1'], ordinal: 0 }];
    await boardsApi.updateColumns('PROJ', 'b1', columns);
    expect(apiClient.put).toHaveBeenCalledWith('/projects/PROJ/boards/b1/columns', { columns });
  });

  it('setDefault sends PATCH', async () => {
    await boardsApi.setDefault('PROJ', 'b1');
    expect(apiClient.patch).toHaveBeenCalledWith('/projects/PROJ/boards/b1/default', {});
  });

  it('delete sends DELETE', async () => {
    await boardsApi.delete('PROJ', 'b1');
    expect(apiClient.delete).toHaveBeenCalledWith('/projects/PROJ/boards/b1');
  });

  it('moveIssue sends POST', async () => {
    const data = { issueId: 'i1', toStatusId: 's2' };
    await boardsApi.moveIssue('PROJ', 'b1', data);
    expect(apiClient.post).toHaveBeenCalledWith('/projects/PROJ/boards/b1/issues/move', data);
  });
});

describe('sprintsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list sends GET with optional status', async () => {
    await sprintsApi.list('b1', 'ACTIVE');
    expect(apiClient.get).toHaveBeenCalledWith('/boards/b1/sprints', { params: { status: 'ACTIVE' } });
  });

  it('list without status sends no params', async () => {
    await sprintsApi.list('b1');
    expect(apiClient.get).toHaveBeenCalledWith('/boards/b1/sprints', { params: undefined });
  });

  it('create sends POST', async () => {
    await sprintsApi.create('b1', { name: 'Sprint 1' });
    expect(apiClient.post).toHaveBeenCalledWith('/boards/b1/sprints', { name: 'Sprint 1' });
  });

  it('start sends POST', async () => {
    await sprintsApi.start('b1', 's1');
    expect(apiClient.post).toHaveBeenCalledWith('/boards/b1/sprints/s1/start', {});
  });

  it('close sends POST', async () => {
    const data = { incompleteIssuesAction: 'MOVE_TO_BACKLOG' as const };
    await sprintsApi.close('b1', 's1', data);
    expect(apiClient.post).toHaveBeenCalledWith('/boards/b1/sprints/s1/close', data);
  });

  it('delete sends DELETE', async () => {
    await sprintsApi.delete('b1', 's1');
    expect(apiClient.delete).toHaveBeenCalledWith('/boards/b1/sprints/s1');
  });

  it('addIssues sends POST with issueIds', async () => {
    await sprintsApi.addIssues('b1', 's1', ['i1', 'i2']);
    expect(apiClient.post).toHaveBeenCalledWith('/boards/b1/sprints/s1/issues', { issueIds: ['i1', 'i2'] });
  });

  it('removeIssues sends DELETE with data', async () => {
    await sprintsApi.removeIssues('b1', 's1', ['i1']);
    expect(apiClient.delete).toHaveBeenCalledWith('/boards/b1/sprints/s1/issues', { data: { issueIds: ['i1'] } });
  });

  it('getBurndown sends GET', async () => {
    await sprintsApi.getBurndown('b1', 's1');
    expect(apiClient.get).toHaveBeenCalledWith('/boards/b1/sprints/s1/burndown');
  });
});
