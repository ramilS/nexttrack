import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  requestId: string;
  /** Set after JWT auth resolves the user; absent on public/unauthenticated requests. */
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function currentRequestContext(): RequestStore | undefined {
  return storage.getStore();
}

/**
 * Attaches the authenticated user id to the active request store so every
 * downstream log line can be correlated to a user without threading the id
 * through call sites. No-op outside a request scope (e.g. background jobs).
 */
export function setRequestUserId(userId: string): void {
  const store = storage.getStore();
  if (store) {
    store.userId = userId;
  }
}
