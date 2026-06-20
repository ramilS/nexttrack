import { apiClient } from './client';
import type {
  FrontendLinkType,
  IssueLink,
  GroupedIssueLinks,
  CreateIssueLinkInput,
} from '@repo/shared/schemas';

// Re-export the shared contract under the names this module's consumers use.
export type IssueLinkType = FrontendLinkType;
export type IssueLinkResponse = IssueLink;
export type GroupedLinksResponse = GroupedIssueLinks;
export type CreateIssueLinkDto = CreateIssueLinkInput;

export const LINK_TYPE_LABELS: Record<IssueLinkType, string> = {
  BLOCKS: 'Blocks',
  IS_BLOCKED_BY: 'Is blocked by',
  RELATES_TO: 'Relates to',
  DUPLICATES: 'Duplicates',
  IS_DUPLICATED_BY: 'Is duplicated by',
};

export const issueLinksApi = {
  list: (issueId: string) =>
    apiClient.get<GroupedLinksResponse[]>(`/issues/${issueId}/links`),

  create: (issueId: string, data: CreateIssueLinkDto) =>
    apiClient.post<IssueLinkResponse>(`/issues/${issueId}/links`, data),

  delete: (issueId: string, linkId: string) =>
    apiClient.delete(`/issues/${issueId}/links/${linkId}`),
};
