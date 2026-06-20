import { apiClient } from './client';
import type { CursorPaginatedResponse } from '@repo/shared';
import type {
  StartTimerInput,
  StopTimerInput,
  CreateTimeLogInput,
  UpdateTimeLogInput,
  ReportGroupBy,
  TimeLog,
  ActiveTimer,
  TimeReportResponse,
  TimeReportGroup,
} from '@repo/shared/schemas';

// Request contracts come from the shared schemas (single source of truth with
// the API), re-exported under this module's existing names so consumers don't
// change.
export type StartTimerRequest = StartTimerInput;
export type StopTimerRequest = StopTimerInput;
export type CreateTimeLogRequest = CreateTimeLogInput;
export type UpdateTimeLogRequest = UpdateTimeLogInput;
export type TimeLogDto = TimeLog;
export type { ReportGroupBy, TimeReportGroup };

// --- Time log types ---

export interface TimeLogListParams {
  cursor?: string;
  pageSize?: number;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Report types ---

export interface TimeReportParams {
  dateFrom: string;
  dateTo: string;
  userIds?: string[];
  issueIds?: string[];
  groupBy: ReportGroupBy;
  page?: number;
  perPage?: number;
}

// --- API ---

export const timerApi = {
  get: () =>
    apiClient.get<ActiveTimer | null>('/time-tracking/timer'),

  start: (data: StartTimerRequest) =>
    apiClient.post<ActiveTimer>('/time-tracking/timer/start', data),

  stop: (data?: StopTimerRequest) =>
    apiClient.post<TimeLogDto>('/time-tracking/timer/stop', data),

  discard: () =>
    apiClient.post('/time-tracking/timer/discard'),

  updateDescription: (description: string) =>
    apiClient.patch<ActiveTimer>('/time-tracking/timer', { description }),
};

export const timeLogsApi = {
  list: (issueId: string, params?: TimeLogListParams) =>
    apiClient.get<CursorPaginatedResponse<TimeLog>>(
      `/issues/${issueId}/time-logs`,
      { params },
    ),

  create: (issueId: string, data: CreateTimeLogRequest) =>
    apiClient.post<TimeLogDto>(`/issues/${issueId}/time-logs`, data),

  update: (issueId: string, logId: string, data: UpdateTimeLogRequest) =>
    apiClient.patch<TimeLogDto>(`/issues/${issueId}/time-logs/${logId}`, data),

  delete: (issueId: string, logId: string) =>
    apiClient.delete(`/issues/${issueId}/time-logs/${logId}`),
};

export const timeReportsApi = {
  get: (projectKey: string, params: TimeReportParams) =>
    apiClient.get<TimeReportResponse>(`/projects/${projectKey}/time-report`, { params }),

  exportCsv: (projectKey: string, params: TimeReportParams) =>
    apiClient.get(`/projects/${projectKey}/time-report/export`, {
      params: { ...params, format: 'csv' },
      responseType: 'blob',
    }),
};
