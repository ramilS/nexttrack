'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  timeLogsApi,
  timeReportsApi,
  type TimeLogListParams,
  type CreateTimeLogRequest,
  type UpdateTimeLogRequest,
  type TimeReportParams,
} from '@/lib/api/time-tracking.api';
import { useMutationWithToast } from './use-mutation-with-toast';

const timeLogKeys = {
  all: ['timeLogs'] as const,
  issue: (issueId: string) => [...timeLogKeys.all, issueId] as const,
};

const reportKeys = {
  all: ['timeReports'] as const,
  project: (key: string, params: TimeReportParams) => [...reportKeys.all, key, params] as const,
};

export function useTimeLogs(issueId: string, params?: TimeLogListParams) {
  return useQuery({
    queryKey: [...timeLogKeys.issue(issueId), params],
    queryFn: async () => {
      const { data } = await timeLogsApi.list(issueId, params);
      return data;
    },
  });
}

export function useCreateTimeLog(issueId: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateTimeLogRequest) => timeLogsApi.create(issueId, data),
    successMessage: 'Time logged',
    errorMessage: 'Failed to log time',
    invalidateKeys: [timeLogKeys.issue(issueId), ['issue', issueId]],
  });
}

export function useUpdateTimeLog(issueId: string) {
  return useMutationWithToast({
    mutationFn: ({ logId, data }: { logId: string; data: UpdateTimeLogRequest }) =>
      timeLogsApi.update(issueId, logId, data),
    successMessage: 'Time log updated',
    errorMessage: 'Failed to update time log',
    invalidateKeys: [timeLogKeys.issue(issueId), ['issue', issueId]],
  });
}

export function useDeleteTimeLog(issueId: string) {
  return useMutationWithToast({
    mutationFn: (logId: string) => timeLogsApi.delete(issueId, logId),
    successMessage: 'Time log deleted',
    errorMessage: 'Failed to delete time log',
    invalidateKeys: [timeLogKeys.issue(issueId), ['issue', issueId]],
  });
}

export function useTimeReport(projectKey: string, params: TimeReportParams) {
  return useQuery({
    queryKey: reportKeys.project(projectKey, params),
    queryFn: async () => {
      const { data } = await timeReportsApi.get(projectKey, params);
      return data;
    },
  });
}

export function useExportTimeReport(projectKey: string) {
  return useMutation({
    mutationFn: (params: TimeReportParams) => timeReportsApi.exportCsv(projectKey, params),
    onSuccess: ({ data }) => {
      const blob = data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `time-report-${projectKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report exported');
    },
  });
}
