import { apiClient } from './client';
import type {
  DocProposalView,
  AiDocsSettingsView,
  UpdateAiDocsSettingsInput,
} from '@repo/shared/schemas';

export const aiDocsApi = {
  getProposal: (issueId: string) =>
    apiClient.get<DocProposalView | null>(`/issues/${issueId}/doc-proposal`),
  getSettings: (projectKey: string) =>
    apiClient.get<AiDocsSettingsView>(`/projects/${projectKey}/ai-docs/settings`),
  updateSettings: (projectKey: string, data: UpdateAiDocsSettingsInput) =>
    apiClient.put<AiDocsSettingsView>(
      `/projects/${projectKey}/ai-docs/settings`,
      data,
    ),
};
