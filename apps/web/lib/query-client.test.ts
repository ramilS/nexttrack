import { describe, it, expect, vi } from 'vitest';
import { MutationObserver } from '@tanstack/react-query';
import { createAppQueryClient } from './query-client';
import { boardKeys } from './hooks/use-boards';
import { issueKeys } from './hooks/use-issues';

describe('createAppQueryClient — meta.invalidates wiring', () => {
  // The seam unit tests can't cover: that a real succeeding mutation routes its
  // declared meta.invalidates through the MutationCache.onSuccess handler. This
  // is what makes the board refresh after an issue change (the reported bug).
  it('invalidates the query-roots a succeeding mutation declares in meta', async () => {
    const client = createAppQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const observer = new MutationObserver(client, {
      mutationFn: async () => 'ok',
      meta: { invalidates: [boardKeys.all, issueKeys.all] },
    });
    await observer.mutate();

    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toContainEqual(boardKeys.all);
    expect(invalidated).toContainEqual(issueKeys.all);
  });

  it('does not invalidate when a mutation declares no meta', async () => {
    const client = createAppQueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const observer = new MutationObserver(client, { mutationFn: async () => 'ok' });
    await observer.mutate();

    expect(spy).not.toHaveBeenCalled();
  });
});
