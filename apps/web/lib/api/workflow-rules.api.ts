import { apiClient } from './client';
import type { PaginatedResponse } from '@repo/shared';
import type {
  WorkflowRule,
  WorkflowRuleExecution,
  WorkflowRuleDryRun,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowCondition,
  CreateWorkflowRuleInput,
  UpdateWorkflowRuleInput,
  TestWorkflowRuleInput,
} from '@repo/shared/schemas';

export type {
  WorkflowRule,
  WorkflowRuleExecution,
  WorkflowRuleDryRun,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowCondition,
  CreateWorkflowRuleInput,
  UpdateWorkflowRuleInput,
  TestWorkflowRuleInput,
};

export const workflowRulesApi = {
  list: (projectKey: string) =>
    apiClient.get<WorkflowRule[]>(`/projects/${projectKey}/workflow-rules`),

  get: (projectKey: string, ruleId: string) =>
    apiClient.get<WorkflowRule>(
      `/projects/${projectKey}/workflow-rules/${ruleId}`,
    ),

  create: (projectKey: string, data: CreateWorkflowRuleInput) =>
    apiClient.post<WorkflowRule>(
      `/projects/${projectKey}/workflow-rules`,
      data,
    ),

  update: (
    projectKey: string,
    ruleId: string,
    data: UpdateWorkflowRuleInput,
  ) =>
    apiClient.patch<WorkflowRule>(
      `/projects/${projectKey}/workflow-rules/${ruleId}`,
      data,
    ),

  delete: (projectKey: string, ruleId: string) =>
    apiClient.delete(`/projects/${projectKey}/workflow-rules/${ruleId}`),

  getExecutionLog: (
    projectKey: string,
    ruleId: string,
    params?: { page?: number },
  ) =>
    apiClient.get<PaginatedResponse<WorkflowRuleExecution>>(
      `/projects/${projectKey}/workflow-rules/${ruleId}/executions`,
      {
        params,
      },
    ),

  testRun: (projectKey: string, ruleId: string, data: TestWorkflowRuleInput) =>
    apiClient.post<WorkflowRuleDryRun>(
      `/projects/${projectKey}/workflow-rules/${ruleId}/test`,
      data,
    ),
};
