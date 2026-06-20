'use client';

import { useQuery } from '@tanstack/react-query';
import { ganttApi } from '@/lib/api/gantt.api';
import type { GanttParams } from '@/lib/api/gantt.api';

export const ganttKeys = {
  all: ['gantt'] as const,
  data: (projectKey: string, params?: GanttParams) =>
    [...ganttKeys.all, 'data', projectKey, params] as const,
};

export function useGanttData(projectKey: string, params?: GanttParams) {
  return useQuery({
    queryKey: ganttKeys.data(projectKey, params),
    queryFn: () => ganttApi.getData(projectKey, params).then((r) => r.data),
    enabled: !!projectKey,
  });
}
