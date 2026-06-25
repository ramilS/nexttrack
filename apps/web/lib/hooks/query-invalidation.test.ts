import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateMutationViews,
  issueViews,
  sprintViews,
} from './query-invalidation';
import { issueKeys } from './use-issues';
import { searchKeys } from './use-search';
import { boardKeys } from './use-boards';
import { sprintKeys } from './use-sprints';

describe('invalidateMutationViews', () => {
  it('invalidates every key listed in meta.invalidates', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    invalidateMutationViews(client, { invalidates: [boardKeys.all, issueKeys.all] });

    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toContainEqual(boardKeys.all);
    expect(invalidated).toContainEqual(issueKeys.all);
  });

  it('does nothing when meta is absent or declares no invalidates', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    invalidateMutationViews(client, undefined);
    invalidateMutationViews(client, {});

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('issueViews', () => {
  // Regression: an issue status/priority change left the board stale because the
  // mutation invalidated issues+search but not the board (a separate, non-ES query).
  it('covers the board, sprint, search, issue and gantt roots', () => {
    const views = issueViews();
    expect(views).toContainEqual(issueKeys.all);
    expect(views).toContainEqual(searchKeys.all);
    expect(views).toContainEqual(boardKeys.all);
    expect(views).toContainEqual(sprintKeys.all);
    expect(views).toContainEqual(['gantt']);
  });
});

describe('sprintViews', () => {
  it('covers the board root so sprint lifecycle changes refresh the board', () => {
    const views = sprintViews();
    expect(views).toContainEqual(sprintKeys.all);
    expect(views).toContainEqual(boardKeys.all);
  });
});
