import { MutationCache, QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { invalidateMutationViews } from '@/lib/hooks/query-invalidation';

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { message?: string | string[]; error?: string | { message?: string } }
      | undefined;
    const nested = typeof data?.error === 'object' ? data.error.message : undefined;
    if (typeof nested === 'string') return nested;
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.message) && typeof data.message[0] === 'string') {
      return data.message[0];
    }
    if (typeof data?.error === 'string') return data.error;
    if (error.response?.status === 403) return 'You do not have permission to perform this action';
    if (error.response?.status === 404) return 'Resource not found';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

/**
 * The app's QueryClient. Extracted from the provider so the global
 * mutation-invalidation wiring (meta.invalidates → invalidateMutationViews) is
 * exercised by tests against the real client, not a hand-rolled copy.
 */
export function createAppQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
    mutationCache: new MutationCache({
      // Single place that invalidates views after any mutation: a mutation
      // declares the affected query-roots via `meta.invalidates` and never
      // calls invalidateQueries itself. See lib/hooks/query-invalidation.
      onSuccess(_data, _variables, _context, mutation) {
        invalidateMutationViews(client, mutation.meta);
      },
      onError(error, _variables, _context, mutation) {
        if (mutation.options.onError) return;
        toast.error(extractErrorMessage(error));
      },
    }),
  });
  return client;
}
