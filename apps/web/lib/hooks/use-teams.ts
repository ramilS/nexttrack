'use client';

import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api/teams.api';
import type { CreateTeamInput, UpdateTeamInput } from '@/lib/api/teams.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const teamKeys = {
  all: ['teams'] as const,
  list: (projectKey: string) => [...teamKeys.all, 'list', projectKey] as const,
  detail: (projectKey: string, teamId: string) =>
    [...teamKeys.all, 'detail', projectKey, teamId] as const,
};

export function useTeams(projectKey: string) {
  return useQuery({
    queryKey: teamKeys.list(projectKey),
    queryFn: () => teamsApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useTeam(projectKey: string, teamId: string) {
  return useQuery({
    queryKey: teamKeys.detail(projectKey, teamId),
    queryFn: () => teamsApi.get(projectKey, teamId).then((r) => r.data),
    enabled: !!projectKey && !!teamId,
  });
}

export function useCreateTeam(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateTeamInput) => teamsApi.create(projectKey, data),
    successMessage: 'Team created',
    errorMessage: 'Failed to create team',
    invalidateKeys: [teamKeys.list(projectKey)],
  });
}

export function useUpdateTeam(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ teamId, data }: { teamId: string; data: UpdateTeamInput }) =>
      teamsApi.update(projectKey, teamId, data),
    successMessage: 'Team updated',
    errorMessage: 'Failed to update team',
    invalidateKeys: [teamKeys.list(projectKey)],
  });
}

export function useDeleteTeam(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (teamId: string) => teamsApi.delete(projectKey, teamId),
    successMessage: 'Team deleted',
    errorMessage: 'Failed to delete team',
    invalidateKeys: [teamKeys.list(projectKey)],
  });
}

export function useAddTeamMembers(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ teamId, userIds }: { teamId: string; userIds: string[] }) =>
      teamsApi.addMembers(projectKey, teamId, userIds),
    successMessage: 'Members added',
    errorMessage: 'Failed to add members',
    invalidateKeys: [teamKeys.all],
  });
}

export function useRemoveTeamMember(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      teamsApi.removeMember(projectKey, teamId, userId),
    successMessage: 'Member removed',
    errorMessage: 'Failed to remove member',
    invalidateKeys: [teamKeys.all],
  });
}
