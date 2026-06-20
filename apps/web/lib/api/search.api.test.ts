import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchApi } from './search.api';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from './client';

describe('searchApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('search sends GET with params', async () => {
    await searchApi.search({ q: 'bug', pageSize: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/search', { params: { q: 'bug', pageSize: 20 } });
  });

  it('autocomplete sends GET with params', async () => {
    await searchApi.autocomplete({ q: 'sta', cursor: 3 });
    expect(apiClient.get).toHaveBeenCalledWith('/search/autocomplete', { params: { q: 'sta', cursor: 3 } });
  });

  it('validate sends GET with query string', async () => {
    await searchApi.validate('status:open');
    expect(apiClient.get).toHaveBeenCalledWith('/search/validate', { params: { q: 'status:open' } });
  });
});
