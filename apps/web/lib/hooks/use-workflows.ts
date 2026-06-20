'use client';

import { useQuery } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api/workflows.api';
import type { CreateWorkflowInput, UpdateWorkflowInput } from '@/lib/api/workflows.api';
import { useMutationWithToast } from './use-mutation-with-toast';
import { projectKeys } from './use-projects';

export const workflowKeys = {
  all: ['workflows'] as const,
  list: (projectKey: string) => [...workflowKeys.all, 'list', projectKey] as const,
  detail: (projectKey: string, id: string) => [...workflowKeys.all, 'detail', projectKey, id] as const,
};

export function useWorkflows(projectKey: string) {
  return useQuery({
    queryKey: workflowKeys.list(projectKey),
    queryFn: () => workflowsApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useWorkflow(projectKey: string, id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(projectKey, id),
    queryFn: () => workflowsApi.get(projectKey, id).then((r) => r.data),
    enabled: !!projectKey && !!id,
  });
}

export function useCreateWorkflow(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateWorkflowInput) =>
      workflowsApi.create(projectKey, data),
    successMessage: 'Workflow created',
    errorMessage: 'Failed to create workflow',
    invalidateKeys: [
      workflowKeys.list(projectKey),
      projectKeys.workflowStatuses(projectKey),
    ],
  });
}

export function useUpdateWorkflow(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkflowInput }) =>
      workflowsApi.update(projectKey, id, data),
    successMessage: 'Workflow updated',
    errorMessage: 'Failed to update workflow',
    invalidateKeys: [
      workflowKeys.list(projectKey),
      projectKeys.workflowStatuses(projectKey),
    ],
  });
}

export function useSetDefaultWorkflow(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (id: string) =>
      workflowsApi.setDefault(projectKey, id),
    successMessage: 'Default workflow updated',
    errorMessage: 'Failed to set default workflow',
    invalidateKeys: [
      workflowKeys.list(projectKey),
      projectKeys.workflowStatuses(projectKey),
    ],
  });
}

export function useDeleteWorkflow(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (id: string) =>
      workflowsApi.delete(projectKey, id),
    successMessage: 'Workflow deleted',
    errorMessage: 'Failed to delete workflow',
    invalidateKeys: [
      workflowKeys.list(projectKey),
      projectKeys.workflowStatuses(projectKey),
    ],
  });
}
