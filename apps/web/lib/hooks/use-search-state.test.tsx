import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { renderHook, act } from '@/test/test-utils';
import { useSearchState } from './use-search-state';

function wrapper({ children }: { children: ReactNode }) {
  return <NuqsTestingAdapter hasMemory>{children}</NuqsTestingAdapter>;
}

function renderSearchState() {
  return renderHook(() => useSearchState(), { wrapper });
}

describe('useSearchState', () => {
  it('starts with an empty query', () => {
    const { result } = renderSearchState();
    expect(result.current.fullQuery).toBe('');
  });

  it('preserves a "sort by:" clause as part of the query (no structured sort state)', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('sort by: created desc'));
    expect(result.current.fullQuery).toBe('sort by: created desc');
  });

  it('keeps a workflow status name verbatim (not upper-cased)', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('status:Open'));
    expect(result.current.status).toBe('Open');
    expect(result.current.fullQuery).toBe('status:Open');
  });

  it('upper-cases the priority enum', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('priority:high'));
    expect(result.current.priority).toBe('HIGH');
  });

  it('does not duplicate a field when its value is deleted', async () => {
    const { result } = renderSearchState();

    await act(async () => result.current.setQuery('status:Open'));
    expect(result.current.fullQuery).toBe('status:Open');

    // Mimic backspacing the value away: the parsed token no longer matches.
    await act(async () => result.current.setQuery('status:'));
    expect(result.current.fullQuery).toBe('status:');
    expect(result.current.status).toBeNull();
  });

  it('clears a field token entirely once removed from the query', async () => {
    const { result } = renderSearchState();

    await act(async () => result.current.setQuery('bug status:Open'));
    expect(result.current.status).toBe('Open');

    await act(async () => result.current.setQuery('bug'));
    expect(result.current.status).toBeNull();
    expect(result.current.fullQuery).toBe('bug');
  });

  it('round-trips a multi-word quoted status', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('status:"In Progress"'));
    expect(result.current.status).toBe('In Progress');
    expect(result.current.fullQuery).toBe('status:"In Progress"');
  });

  it('maps #MyIssues to assignee:{me}', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('#MyIssues'));
    expect(result.current.assignee).toBe('me');
    expect(result.current.fullQuery).toBe('assignee:{me}');
  });

  it('setFilter updates a single field without touching others', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('bug'));
    await act(async () => result.current.setFilter('priority', 'HIGH'));
    expect(result.current.q).toBe('bug');
    expect(result.current.priority).toBe('HIGH');
  });

  it('clearFilters resets every filter to its default', async () => {
    const { result } = renderSearchState();
    await act(async () => result.current.setQuery('bug status:Open priority:high'));
    await act(async () => result.current.clearFilters());

    expect(result.current.fullQuery).toBe('');
    expect(result.current.status).toBeNull();
    expect(result.current.priority).toBeNull();
  });
});
