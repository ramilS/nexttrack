'use client';

import { useQuery } from '@tanstack/react-query';
import type { UserTimeReportResponse } from '@repo/shared/schemas';
import { apiClient } from '@/lib/api/client';

export type UserTimeLog = UserTimeReportResponse['logs'][number];

export interface UserTimeReportParams {
  dateFrom: string;
  dateTo: string;
  projectId?: string;
}

const userTimeReportKeys = {
  all: ['user-time-report'] as const,
  report: (params: UserTimeReportParams) => [...userTimeReportKeys.all, params] as const,
};

export function useUserTimeReport(params: UserTimeReportParams) {
  return useQuery({
    queryKey: userTimeReportKeys.report(params),
    queryFn: async () => {
      const { data } = await apiClient.get<UserTimeReportResponse>('/users/me/time-report', {
        params,
      });
      return data;
    },
    enabled: !!params.dateFrom && !!params.dateTo,
  });
}
