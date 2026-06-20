'use client';

import { useQuery } from '@tanstack/react-query';
import { issueLinksApi } from '@/lib/api/issue-links.api';
import type { CreateIssueLinkDto } from '@/lib/api/issue-links.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const issueLinkKeys = {
  all: ['issue-links'] as const,
  list: (issueId: string) => [...issueLinkKeys.all, 'list', issueId] as const,
};

export function useIssueLinks(issueId: string) {
  return useQuery({
    queryKey: issueLinkKeys.list(issueId),
    queryFn: () => issueLinksApi.list(issueId).then((r) => r.data),
    enabled: !!issueId,
  });
}

export function useCreateIssueLink(issueId: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateIssueLinkDto) => issueLinksApi.create(issueId, data),
    successMessage: 'Link added',
    errorMessage: 'Failed to add link',
    invalidateKeys: [issueLinkKeys.list(issueId)],
  });
}

export function useDeleteIssueLink(issueId: string) {
  return useMutationWithToast({
    mutationFn: (linkId: string) => issueLinksApi.delete(issueId, linkId),
    successMessage: 'Link removed',
    errorMessage: 'Failed to remove link',
    invalidateKeys: [issueLinkKeys.list(issueId)],
  });
}
