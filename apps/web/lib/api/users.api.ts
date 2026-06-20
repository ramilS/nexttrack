import { apiClient } from './client';
import type { PaginatedResponse } from '@repo/shared';
import type {
  User,
  CurrentUser,
  Invite,
  UserMembership,
  GlobalRole,
  UpdateUserInput,
  AdminUpdateUserInput,
  ChangePasswordInput,
  SendInviteInput,
  BlockUserInput,
  ListUsersQuery,
  ListInvitesQuery,
} from '@repo/shared/schemas';

export type {
  User,
  Invite,
  UserMembership,
  GlobalRole,
  UpdateUserInput,
  AdminUpdateUserInput,
  ChangePasswordInput,
  SendInviteInput,
  BlockUserInput,
  ListUsersQuery,
  ListInvitesQuery,
};

export const usersApi = {
  list: (params?: ListUsersQuery) =>
    apiClient.get<PaginatedResponse<User>>('/users', { params }),

  getById: (id: string) =>
    apiClient.get<User>(`/users/${id}`),

  adminUpdate: (id: string, data: AdminUpdateUserInput) =>
    apiClient.patch<User>(`/users/${id}`, data),

  getMemberships: (id: string) =>
    apiClient.get<UserMembership[]>(`/users/${id}/memberships`),

  invite: (data: SendInviteInput) =>
    apiClient.post<Invite>('/users/invite', data),

  resendInvite: (inviteId: string) =>
    apiClient.post<Invite>(`/users/invite/${inviteId}/resend`),

  revokeInvite: (inviteId: string) =>
    apiClient.delete(`/users/invite/${inviteId}`),

  listInvites: (params?: ListInvitesQuery) =>
    apiClient.get<Invite[]>('/users/invites', { params }),

  block: (userId: string, reason?: string) =>
    apiClient.patch<User>(`/users/${userId}/block`, { reason } satisfies BlockUserInput),

  unblock: (userId: string) =>
    apiClient.patch<User>(`/users/${userId}/unblock`),

  delete: (userId: string) =>
    apiClient.delete(`/users/${userId}`),

  restore: (userId: string) =>
    apiClient.post<User>(`/users/${userId}/restore`),

  updateProfile: (data: UpdateUserInput) =>
    apiClient.patch<CurrentUser>('/users/me', data),

  changePassword: (data: ChangePasswordInput) =>
    apiClient.patch('/users/me/password', data),
};
