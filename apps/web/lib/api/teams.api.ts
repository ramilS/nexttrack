import { apiClient } from './client';
import type {
  Team,
  TeamMember,
  CreateTeamInput,
  UpdateTeamInput,
  AddTeamMembersInput,
} from '@repo/shared/schemas';

export type { Team, TeamMember, CreateTeamInput, UpdateTeamInput, AddTeamMembersInput };

export const teamsApi = {
  list: (projectKey: string) =>
    apiClient.get<Team[]>(`/projects/${projectKey}/teams`),

  get: (projectKey: string, teamId: string) =>
    apiClient.get<Team>(`/projects/${projectKey}/teams/${teamId}`),

  create: (projectKey: string, data: CreateTeamInput) =>
    apiClient.post<Team>(`/projects/${projectKey}/teams`, data),

  update: (projectKey: string, teamId: string, data: UpdateTeamInput) =>
    apiClient.patch<Team>(`/projects/${projectKey}/teams/${teamId}`, data),

  delete: (projectKey: string, teamId: string) =>
    apiClient.delete(`/projects/${projectKey}/teams/${teamId}`),

  addMembers: (projectKey: string, teamId: string, userIds: AddTeamMembersInput['userIds']) =>
    apiClient.post<Team>(`/projects/${projectKey}/teams/${teamId}/members`, { userIds }),

  removeMember: (projectKey: string, teamId: string, userId: string) =>
    apiClient.delete(`/projects/${projectKey}/teams/${teamId}/members/${userId}`),
};
