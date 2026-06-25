'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { issueKeys } from './use-issues';
import { searchKeys } from './use-search';
import { boardKeys } from './use-boards';
import { sprintKeys } from './use-sprints';

// Type the `meta.invalidates` channel a mutation uses to declare which view
// query-roots it affects. The global MutationCache handler (query-provider)
// reads it on success — see invalidateMutationViews.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Query-key roots to invalidate after this mutation succeeds. */
      invalidates?: QueryKey[];
    };
  }
}

const GANTT_KEY: QueryKey = ['gantt'];

/**
 * Every view that renders issue data — the list, the ES-backed search, the
 * board, sprint boards/backlog and the gantt. Each is a separate query, and the
 * board and gantt are NOT Elasticsearch-backed, so a change to a single issue
 * must mark all of them stale; otherwise the ones not currently mounted keep
 * serving cached rows until their staleTime lapses (30s) or a hard reload. A
 * function, not a const, so it is never evaluated at module load (the key
 * factories live in modules that import this one back).
 */
export function issueViews(): QueryKey[] {
  return [issueKeys.all, searchKeys.all, boardKeys.all, sprintKeys.all, GANTT_KEY];
}

/**
 * Sprint lifecycle changes (create/update/start/close/delete and membership)
 * alter what the board shows — the active-sprint banner and card membership —
 * as well as the sprint views themselves.
 */
export function sprintViews(): QueryKey[] {
  return [sprintKeys.all, boardKeys.all];
}

/**
 * Invalidates every query prefixed by a root the mutation declared in
 * `meta.invalidates`. Wired once into the app QueryClient's MutationCache so no
 * mutation has to call invalidateQueries itself — declaring the affected views
 * is enough, and the set can't drift between call sites (the bug this fixes was
 * one mutation forgetting the `boards` root).
 */
export function invalidateMutationViews(
  client: QueryClient,
  meta: { invalidates?: QueryKey[] } | undefined,
): void {
  const keys = meta?.invalidates;
  if (!keys) return;
  for (const key of keys) {
    void client.invalidateQueries({ queryKey: key });
  }
}
