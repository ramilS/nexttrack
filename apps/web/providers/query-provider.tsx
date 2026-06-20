'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AxiosError } from 'axios';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

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

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
          onError(error, _variables, _context, mutation) {
            if (mutation.options.onError) return;
            toast.error(extractErrorMessage(error));
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
