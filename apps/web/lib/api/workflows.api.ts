import { apiClient } from './client';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '@repo/shared/schemas';

export type {
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
  CreateWorkflowInput,
  UpdateWorkflowInput,
};

/** Aliases retained for legacy import sites. */
export type WorkflowDto = Workflow;
export type WorkflowStatusData = WorkflowStatus;
export type WorkflowTransitionData = WorkflowTransition;

export const workflowsApi = {
  list: (projectKey: string) =>
    apiClient.get<Workflow[]>(`/projects/${projectKey}/workflows`),

  get: (projectKey: string, id: string) =>
    apiClient.get<Workflow>(`/projects/${projectKey}/workflows/${id}`),

  create: (projectKey: string, data: CreateWorkflowInput) =>
    apiClient.post<Workflow>(`/projects/${projectKey}/workflows`, data),

  update: (projectKey: string, id: string, data: UpdateWorkflowInput) =>
    apiClient.put<Workflow>(`/projects/${projectKey}/workflows/${id}`, data),

  setDefault: (projectKey: string, id: string) =>
    apiClient.patch<Workflow>(`/projects/${projectKey}/workflows/${id}/default`),

  delete: (projectKey: string, id: string) =>
    apiClient.delete(`/projects/${projectKey}/workflows/${id}`),
};
