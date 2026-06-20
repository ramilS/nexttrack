import { apiClient } from './client';
import type { GanttData, GanttItem, GanttGroupBy } from '@repo/shared/schemas';

export type { GanttGroupBy, GanttItem, GanttData };

export interface GanttParams {
  from?: string;
  to?: string;
  groupBy?: GanttGroupBy;
  sprintId?: string;
  assigneeId?: string;
}

export const ganttApi = {
  getData: (projectKey: string, params?: GanttParams) =>
    apiClient.get<GanttData>(`/projects/${projectKey}/gantt`, { params }),
};
