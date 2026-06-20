import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { issueKeys } from './use-issues';
import { searchKeys } from './use-search';
import { boardKeys } from './use-boards';
import { commentKeys } from './use-comments';
import { sprintKeys } from './use-sprints';

// Capture the handlers the hook registers so we can fire socket events by name.
const { socketMock, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socketMock = {
    on: (event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, cb);
    },
    off: vi.fn(),
    emit: vi.fn(),
  };
  return { socketMock, handlers };
});

vi.mock('@/providers/socket-provider', () => ({ useSocket: () => socketMock }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { useRealtimeUpdates } from './use-realtime';

function setup(projectKey = 'PROJ') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(() => useRealtimeUpdates(projectKey), { wrapper });
  return invalidate;
}

function invalidatedKeys(spy: Mock): unknown[] {
  return spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
}

describe('useRealtimeUpdates', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it('invalidates the ES-backed search list and the board on issue:created', () => {
    const invalidate = setup();
    handlers.get('issue:created')!();

    const keys = invalidatedKeys(invalidate as unknown as Mock);
    expect(keys).toContainEqual(searchKeys.all);
    expect(keys).toContainEqual(boardKeys.all);
  });

  it('invalidates issue, search and board caches on issue:updated', () => {
    const invalidate = setup();
    handlers.get('issue:updated')!();

    const keys = invalidatedKeys(invalidate as unknown as Mock);
    expect(keys).toContainEqual(issueKeys.all);
    expect(keys).toContainEqual(searchKeys.all);
    expect(keys).toContainEqual(boardKeys.all);
  });

  it('invalidates the comment list for the event issue on comment:created', () => {
    const invalidate = setup();
    handlers.get('comment:created')!({ payload: { issueId: 'issue-1' }, actorId: 'u1' });

    const keys = invalidatedKeys(invalidate as unknown as Mock);
    expect(keys).toContainEqual(commentKeys.list('issue-1'));
  });

  it('invalidates the board on board:issue-moved', () => {
    const invalidate = setup();
    handlers.get('board:issue-moved')!();

    expect(invalidatedKeys(invalidate as unknown as Mock)).toContainEqual(boardKeys.all);
  });

  it('invalidates sprints on sprint:started and sprint:closed', () => {
    const invalidate = setup();
    handlers.get('sprint:started')!({ payload: { name: 'S1' }, actorId: 'u1' });
    handlers.get('sprint:closed')!({ payload: { name: 'S1' }, actorId: 'u1' });

    expect(invalidatedKeys(invalidate as unknown as Mock)).toContainEqual(sprintKeys.all);
  });
});
