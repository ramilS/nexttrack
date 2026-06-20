import { apiClient } from './client';
import type { Attachment } from '@repo/shared/schemas';

export type { Attachment };

export const attachmentsApi = {
  list: (issueId: string) =>
    apiClient.get<Attachment[]>(`/issues/${issueId}/attachments`),

  upload: (issueId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return apiClient.post<Attachment[]>(
      `/issues/${issueId}/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  delete: (issueId: string, attachmentId: string) =>
    apiClient.delete(`/issues/${issueId}/attachments/${attachmentId}`),
};
