'use client';

import { useQuery } from '@tanstack/react-query';
import { aiDocsApi } from '@/lib/api/ai-docs.api';
import { useMutationWithToast } from './use-mutation-with-toast';
import type { UpdateAiDocsSettingsInput } from '@repo/shared/schemas';

export const aiDocsKeys = {
  all: ['ai-docs'] as const,
  proposal: (issueId: string) => [...aiDocsKeys.all, 'proposal', issueId] as const,
  settings: (projectKey: string) =>
    [...aiDocsKeys.all, 'settings', projectKey] as const,
};

export function useDocProposal(issueId: string) {
  return useQuery({
    queryKey: aiDocsKeys.proposal(issueId),
    queryFn: () => aiDocsApi.getProposal(issueId).then((r) => r.data),
    enabled: !!issueId,
  });
}

export function useAiDocsSettings(projectKey: string) {
  return useQuery({
    queryKey: aiDocsKeys.settings(projectKey),
    queryFn: () => aiDocsApi.getSettings(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useUpdateAiDocsSettings(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: UpdateAiDocsSettingsInput) =>
      aiDocsApi.updateSettings(projectKey, data).then((r) => r.data),
    invalidateKeys: [aiDocsKeys.settings(projectKey)],
    successMessage: 'AI-docs prompts saved',
    errorMessage: 'Failed to save prompts',
  });
}
