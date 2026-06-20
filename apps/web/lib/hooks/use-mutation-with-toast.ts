'use client';

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api/error-message';

type MutationWithToastOptions<TData, TVariables, TContext> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  'onSuccess' | 'onError'
> & {
  successMessage?: string | ((data: TData) => string);
  errorMessage?: string;
  invalidateKeys?: QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};

export function useMutationWithToast<
  TData = unknown,
  TVariables = void,
  TContext = unknown,
>(options: MutationWithToastOptions<TData, TVariables, TContext>) {
  const queryClient = useQueryClient();
  const {
    successMessage,
    errorMessage = 'Something went wrong',
    invalidateKeys,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<TData, Error, TVariables, TContext>({
    ...rest,
    onSuccess: (data, variables) => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      if (successMessage) {
        const message =
          typeof successMessage === 'function'
            ? successMessage(data)
            : successMessage;
        toast.success(message);
      }

      onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      toast.error(getApiErrorMessage(error) ?? errorMessage);
      onError?.(error, variables);
    },
  });
}
