'use client';

import { useQuery } from '@tanstack/react-query';
import { autoAssignApi } from '@/lib/api/auto-assign.api';
import type {
  CreateAutoAssignRuleInput,
  UpdateAutoAssignRuleInput,
  PreviewAutoAssignInput,
} from '@/lib/api/auto-assign.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const autoAssignKeys = {
  all: ['auto-assign'] as const,
  list: (projectKey: string) => [...autoAssignKeys.all, 'list', projectKey] as const,
  preview: (projectKey: string) => [...autoAssignKeys.all, 'preview', projectKey] as const,
};

export function useAutoAssignRules(projectKey: string) {
  return useQuery({
    queryKey: autoAssignKeys.list(projectKey),
    queryFn: () => autoAssignApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useCreateAutoAssignRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateAutoAssignRuleInput) => autoAssignApi.create(projectKey, data),
    successMessage: 'Rule created',
    errorMessage: 'Failed to create rule',
    invalidateKeys: [autoAssignKeys.list(projectKey)],
  });
}

export function useUpdateAutoAssignRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({
      ruleId,
      data,
    }: {
      ruleId: string;
      data: UpdateAutoAssignRuleInput;
    }) => autoAssignApi.update(projectKey, ruleId, data),
    successMessage: 'Rule updated',
    errorMessage: 'Failed to update rule',
    invalidateKeys: [autoAssignKeys.list(projectKey)],
  });
}

export function useDeleteAutoAssignRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (ruleId: string) => autoAssignApi.delete(projectKey, ruleId),
    successMessage: 'Rule deleted',
    errorMessage: 'Failed to delete rule',
    invalidateKeys: [autoAssignKeys.list(projectKey)],
  });
}

export function usePreviewAutoAssign(
  projectKey: string,
  data: PreviewAutoAssignInput | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...autoAssignKeys.preview(projectKey), data],
    queryFn: () => autoAssignApi.preview(projectKey, data!).then((r) => r.data),
    enabled: enabled && !!projectKey && !!data,
  });
}
