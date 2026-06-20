'use client';

import { useQuery } from '@tanstack/react-query';
import { workflowRulesApi } from '@/lib/api/workflow-rules.api';
import type {
  CreateWorkflowRuleInput,
  UpdateWorkflowRuleInput,
  TestWorkflowRuleInput,
} from '@/lib/api/workflow-rules.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const workflowRuleKeys = {
  all: ['workflow-rules'] as const,
  list: (projectKey: string) =>
    [...workflowRuleKeys.all, 'list', projectKey] as const,
  detail: (projectKey: string, ruleId: string) =>
    [...workflowRuleKeys.all, 'detail', projectKey, ruleId] as const,
  executions: (projectKey: string, ruleId: string, page?: number) =>
    [...workflowRuleKeys.all, 'executions', projectKey, ruleId, page] as const,
};

export function useWorkflowRules(projectKey: string) {
  return useQuery({
    queryKey: workflowRuleKeys.list(projectKey),
    queryFn: () => workflowRulesApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useWorkflowRule(projectKey: string, ruleId: string) {
  return useQuery({
    queryKey: workflowRuleKeys.detail(projectKey, ruleId),
    queryFn: () => workflowRulesApi.get(projectKey, ruleId).then((r) => r.data),
    enabled: !!projectKey && !!ruleId,
  });
}

export function useCreateWorkflowRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateWorkflowRuleInput) =>
      workflowRulesApi.create(projectKey, data),
    successMessage: 'Automation rule created',
    errorMessage: 'Failed to create automation rule',
    invalidateKeys: [workflowRuleKeys.list(projectKey)],
  });
}

export function useUpdateWorkflowRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({
      ruleId,
      data,
    }: {
      ruleId: string;
      data: UpdateWorkflowRuleInput;
    }) => workflowRulesApi.update(projectKey, ruleId, data),
    successMessage: 'Rule updated',
    errorMessage: 'Failed to update rule',
    invalidateKeys: [workflowRuleKeys.all],
  });
}

export function useDeleteWorkflowRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (ruleId: string) =>
      workflowRulesApi.delete(projectKey, ruleId),
    successMessage: 'Rule deleted',
    errorMessage: 'Failed to delete rule',
    invalidateKeys: [workflowRuleKeys.list(projectKey)],
  });
}

export function useWorkflowExecutionLog(
  projectKey: string,
  ruleId: string,
  page = 1,
) {
  return useQuery({
    queryKey: workflowRuleKeys.executions(projectKey, ruleId, page),
    queryFn: () =>
      workflowRulesApi
        .getExecutionLog(projectKey, ruleId, { page })
        .then((r) => r.data),
    enabled: !!projectKey && !!ruleId,
  });
}

export function useTestWorkflowRule(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({
      ruleId,
      payload,
    }: {
      ruleId: string;
      payload: TestWorkflowRuleInput;
    }) =>
      workflowRulesApi
        .testRun(projectKey, ruleId, payload)
        .then((r) => r.data),
    errorMessage: 'Failed to test rule',
  });
}
