'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachmentsApi } from '@/lib/api/attachments.api';
import { toast } from 'sonner';
import { useMutationWithToast } from './use-mutation-with-toast';

export const attachmentKeys = {
  all: ['attachments'] as const,
  list: (issueId: string) => [...attachmentKeys.all, 'list', issueId] as const,
};

export function useAttachments(issueId: string) {
  return useQuery({
    queryKey: attachmentKeys.list(issueId),
    queryFn: () => attachmentsApi.list(issueId).then((r) => r.data),
    enabled: !!issueId,
  });
}

export function useUploadAttachments(issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: File[]) => {
      const validFiles = files.filter((f) => {
        if (f.size > 50 * 1024 * 1024) {
          toast.error(`${f.name} exceeds 50MB limit`);
          return false;
        }
        return true;
      });
      if (validFiles.length === 0) throw new Error('No valid files');
      return attachmentsApi.upload(issueId, validFiles);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(issueId) });
      toast.success('Files uploaded');
    },
    onError: () => {
      toast.error('Upload failed');
    },
  });
}

export function useDeleteAttachment(issueId: string) {
  return useMutationWithToast({
    mutationFn: (attachmentId: string) => attachmentsApi.delete(issueId, attachmentId),
    successMessage: 'Attachment deleted',
    errorMessage: 'Failed to delete attachment',
    invalidateKeys: [attachmentKeys.list(issueId)],
  });
}
