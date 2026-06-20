'use client';

import { useQuery } from '@tanstack/react-query';
import { versionsApi } from '@/lib/api/versions.api';
import type { CreateVersionInput, UpdateVersionInput, VersionStatus } from '@/lib/api/versions.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const versionKeys = {
  all: ['versions'] as const,
  list: (projectKey: string, status?: VersionStatus) =>
    [...versionKeys.all, 'list', projectKey, status] as const,
};

export function useVersions(projectKey: string, status?: VersionStatus) {
  return useQuery({
    queryKey: versionKeys.list(projectKey, status),
    queryFn: () => versionsApi.list(projectKey, status).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useCreateVersion(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateVersionInput) => versionsApi.create(projectKey, data),
    successMessage: 'Version created',
    errorMessage: 'Failed to create version',
    invalidateKeys: [versionKeys.list(projectKey)],
  });
}

export function useUpdateVersion(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ versionId, data }: { versionId: string; data: UpdateVersionInput }) =>
      versionsApi.update(projectKey, versionId, data),
    errorMessage: 'Failed to update version',
    invalidateKeys: [versionKeys.list(projectKey)],
  });
}

export function useReleaseVersion(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ versionId, releaseDate }: { versionId: string; releaseDate?: string }) =>
      versionsApi.release(projectKey, versionId, releaseDate),
    successMessage: 'Version released',
    errorMessage: 'Failed to release version',
    invalidateKeys: [versionKeys.list(projectKey)],
  });
}

export function useArchiveVersion(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (versionId: string) => versionsApi.archive(projectKey, versionId),
    successMessage: 'Version archived',
    errorMessage: 'Failed to archive version',
    invalidateKeys: [versionKeys.list(projectKey)],
  });
}

export function useDeleteVersion(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (versionId: string) => versionsApi.delete(projectKey, versionId),
    successMessage: 'Version deleted',
    errorMessage: 'Failed to delete version',
    invalidateKeys: [versionKeys.list(projectKey)],
  });
}
