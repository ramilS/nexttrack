'use client';

import { usersApi, type UpdateUserInput, type ChangePasswordInput } from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMutationWithToast } from './use-mutation-with-toast';

export function useUpdateProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutationWithToast({
    mutationFn: (data: UpdateUserInput) => usersApi.updateProfile(data),
    successMessage: 'Profile updated',
    errorMessage: 'Failed to update profile',
    invalidateKeys: [['currentUser']],
    onSuccess: (_res, variables) => {
      if (user) {
        setUser({
          ...user,
          name: variables.name ?? user.name,
          avatarUrl: variables.avatarUrl !== undefined ? variables.avatarUrl : user.avatarUrl,
        });
      }
    },
  });
}

export function useChangePassword() {
  return useMutationWithToast({
    mutationFn: (data: ChangePasswordInput) => usersApi.changePassword(data),
    successMessage: 'Password changed',
    errorMessage: 'Failed to change password',
  });
}
