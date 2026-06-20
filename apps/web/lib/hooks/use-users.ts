'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, type ListUsersQuery, type SendInviteInput, type AdminUpdateUserInput, type ListInvitesQuery } from '@/lib/api/users.api';
import { useMutationWithToast } from './use-mutation-with-toast';

const userKeys = {
  all: ['admin-users'] as const,
  list: (params?: ListUsersQuery) => [...userKeys.all, 'list', params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  memberships: (id: string) => [...userKeys.all, 'memberships', id] as const,
  invites: ['admin-invites'] as const,
};

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const { data } = await usersApi.getById(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useUserMemberships(id: string) {
  return useQuery({
    queryKey: userKeys.memberships(id),
    queryFn: async () => {
      const { data } = await usersApi.getMemberships(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();

  return useMutationWithToast({
    mutationFn: ({ userId, data }: { userId: string; data: AdminUpdateUserInput }) =>
      usersApi.adminUpdate(userId, data),
    successMessage: 'User updated',
    errorMessage: 'Failed to update user',
    invalidateKeys: [userKeys.all],
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: userKeys.detail(vars.userId) });
    },
  });
}

export function useUsers(params?: ListUsersQuery) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: async () => {
      const { data } = await usersApi.list(params);
      return data;
    },
  });
}

export function useInvites(params?: ListInvitesQuery) {
  return useQuery({
    queryKey: [...userKeys.invites, params],
    queryFn: async () => {
      const { data } = await usersApi.listInvites(params);
      return data;
    },
  });
}

export function useSendInvite() {
  return useMutationWithToast({
    mutationFn: (data: SendInviteInput) => usersApi.invite(data),
    successMessage: 'Invite sent',
    errorMessage: 'Failed to send invite',
    invalidateKeys: [userKeys.invites],
  });
}

export function useResendInvite() {
  return useMutationWithToast({
    mutationFn: (inviteId: string) => usersApi.resendInvite(inviteId),
    successMessage: 'Invite resent',
    errorMessage: 'Failed to resend invite',
  });
}

export function useRevokeInvite() {
  return useMutationWithToast({
    mutationFn: (inviteId: string) => usersApi.revokeInvite(inviteId),
    successMessage: 'Invite revoked',
    errorMessage: 'Failed to revoke invite',
    invalidateKeys: [userKeys.invites],
  });
}

export function useBlockUser() {
  return useMutationWithToast({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      usersApi.block(userId, reason),
    successMessage: 'User blocked',
    errorMessage: 'Failed to block user',
    invalidateKeys: [userKeys.all],
  });
}

export function useUnblockUser() {
  return useMutationWithToast({
    mutationFn: (userId: string) => usersApi.unblock(userId),
    successMessage: 'User unblocked',
    errorMessage: 'Failed to unblock user',
    invalidateKeys: [userKeys.all],
  });
}

export function useDeleteUser() {
  return useMutationWithToast({
    mutationFn: (userId: string) => usersApi.delete(userId),
    successMessage: 'User deleted',
    errorMessage: 'Failed to delete user',
    invalidateKeys: [userKeys.all],
  });
}

export function useRestoreUser() {
  return useMutationWithToast({
    mutationFn: (userId: string) => usersApi.restore(userId),
    successMessage: 'User restored',
    errorMessage: 'Failed to restore user',
    invalidateKeys: [userKeys.all],
  });
}
