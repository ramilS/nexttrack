'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFieldsApi } from '@/lib/api/custom-fields.api';
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from '@/lib/api/custom-fields.api';
import { issueKeys } from './use-issues';
import { useMutationWithToast } from './use-mutation-with-toast';

export const customFieldKeys = {
  all: ['custom-fields'] as const,
  list: (projectKey: string) => [...customFieldKeys.all, 'list', projectKey] as const,
  detail: (projectKey: string, fieldId: string) =>
    [...customFieldKeys.all, 'detail', projectKey, fieldId] as const,
  issueValues: (issueId: string) => [...customFieldKeys.all, 'values', issueId] as const,
};

export function useCustomFields(projectKey: string) {
  return useQuery({
    queryKey: customFieldKeys.list(projectKey),
    queryFn: () => customFieldsApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useCreateCustomField(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateCustomFieldInput) => customFieldsApi.create(projectKey, data),
    successMessage: 'Custom field created',
    errorMessage: 'Failed to create custom field',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

export function useUpdateCustomField(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: UpdateCustomFieldInput }) =>
      customFieldsApi.update(projectKey, fieldId, data),
    errorMessage: 'Failed to update custom field',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

export function useDeleteCustomField(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (fieldId: string) => customFieldsApi.delete(projectKey, fieldId),
    successMessage: 'Custom field deleted',
    errorMessage: 'Failed to delete custom field',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

export function useReorderCustomFields(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (ordinals: { id: string; ordinal: number }[]) =>
      customFieldsApi.reorder(projectKey, ordinals),
    errorMessage: 'Failed to reorder fields',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

export function useAddFieldOption(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: { name: string; color?: string } }) =>
      customFieldsApi.addOption(projectKey, fieldId, data),
    errorMessage: 'Failed to add option',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

export function useDeleteFieldOption(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ fieldId, optionId }: { fieldId: string; optionId: string }) =>
      customFieldsApi.deleteOption(projectKey, fieldId, optionId),
    errorMessage: 'Failed to delete option',
    invalidateKeys: [customFieldKeys.list(projectKey)],
  });
}

// Get field values for an issue
export function useIssueFieldValues(issueId: string) {
  return useQuery({
    queryKey: customFieldKeys.issueValues(issueId),
    queryFn: () => customFieldsApi.getIssueFields(issueId).then((r) => r.data),
    enabled: !!issueId,
  });
}

// Set field value on an issue
export function useSetFieldValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      issueId,
      fieldId,
      value,
    }: {
      issueId: string;
      fieldId: string;
      value: unknown;
    }) =>
      value == null
        ? customFieldsApi.clearIssueFieldValue(issueId, fieldId)
        : customFieldsApi.setIssueFieldValue(issueId, fieldId, value),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: customFieldKeys.issueValues(variables.issueId),
      });
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}
