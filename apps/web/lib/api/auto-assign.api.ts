import { apiClient } from './client';
import type {
  AutoAssignRule,
  AutoAssignConditions,
  AutoAssignPreview,
  AssignStrategy,
  CreateAutoAssignRuleInput,
  UpdateAutoAssignRuleInput,
  PreviewAutoAssignInput,
} from '@repo/shared/schemas';

export type {
  AutoAssignRule,
  AutoAssignConditions,
  AutoAssignPreview,
  AssignStrategy,
  CreateAutoAssignRuleInput,
  UpdateAutoAssignRuleInput,
  PreviewAutoAssignInput,
};

/** Backwards-compat alias used by feature components. */
export type RuleConditions = AutoAssignConditions;

export const autoAssignApi = {
  list: (projectKey: string) =>
    apiClient.get<AutoAssignRule[]>(`/projects/${projectKey}/auto-assign`),

  create: (projectKey: string, data: CreateAutoAssignRuleInput) =>
    apiClient.post<AutoAssignRule>(`/projects/${projectKey}/auto-assign`, data),

  update: (projectKey: string, ruleId: string, data: UpdateAutoAssignRuleInput) =>
    apiClient.patch<AutoAssignRule>(
      `/projects/${projectKey}/auto-assign/${ruleId}`,
      data,
    ),

  delete: (projectKey: string, ruleId: string) =>
    apiClient.delete(`/projects/${projectKey}/auto-assign/${ruleId}`),

  preview: (projectKey: string, data: PreviewAutoAssignInput) =>
    apiClient.post<AutoAssignPreview>(
      `/projects/${projectKey}/auto-assign/preview`,
      data,
    ),
};
