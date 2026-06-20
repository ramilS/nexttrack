'use client';

import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api/projects.api';
import type { ListProjectsQuery } from '@repo/shared/schemas';
import { useRouter } from 'next/navigation';
import { useMutationWithToast } from './use-mutation-with-toast';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params?: Record<string, unknown>) => [...projectKeys.all, 'list', params] as const,
  detail: (key: string) => [...projectKeys.all, 'detail', key] as const,
  members: (projectId: string) => [...projectKeys.all, 'members', projectId] as const,
  workflowStatuses: (projectKey: string) => [...projectKeys.all, 'workflow-statuses', projectKey] as const,
};

export function useProjects(params?: ListProjectsQuery) {
  return useQuery({
    queryKey: projectKeys.list(params as Record<string, unknown>),
    queryFn: () => projectsApi.list(params).then((r) => r.data),
  });
}

export function useProject(key: string) {
  return useQuery({
    queryKey: projectKeys.detail(key),
    queryFn: () => projectsApi.getByKey(key).then((r) => r.data),
    enabled: !!key,
  });
}

export function useCreateProject() {
  const router = useRouter();

  return useMutationWithToast({
    mutationFn: projectsApi.create,
    successMessage: (res) => `Project ${res.data.key} created`,
    errorMessage: 'Failed to create project',
    invalidateKeys: [projectKeys.all],
    onSuccess: (res) => {
      router.push(`/projects/${res.data.key}/issues`);
    },
  });
}

export function useProjectMembers(projectKey: string) {
  return useQuery({
    queryKey: projectKeys.members(projectKey),
    queryFn: () => projectsApi.getMembers(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useWorkflowStatuses(projectKey: string) {
  return useQuery({
    queryKey: projectKeys.workflowStatuses(projectKey),
    queryFn: () => projectsApi.getWorkflowStatuses(projectKey).then((r) => r.data),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1000,
  });
}
