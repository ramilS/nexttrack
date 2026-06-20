import { apiClient } from './client';
import type { PaginatedResponse, CursorPaginatedResponse } from '@repo/shared';
import type {
  Board,
  BoardColumn,
  BoardColumnData,
  BoardData,
  BoardIssueCard,
  BoardMoveResult,
  BoardSwimlaneData,
  BoardType,
  SwimlaneBy,
  CreateBoardInput,
  UpdateBoardInput,
  MoveIssueInput,
  Sprint,
  SprintStatus,
  SprintWithIssues,
  BacklogResponse,
  AddSprintIssuesResult,
  RemoveSprintIssuesResult,
  CreateSprintInput,
  UpdateSprintInput,
  StartSprintInput,
  CloseSprintInput,
  CloseSprintResult,
  BurndownPoint,
  IncompleteIssueAction,
} from '@repo/shared/schemas';

export type {
  Board,
  BoardColumn,
  BoardColumnData,
  BoardIssueCard,
  BoardSwimlaneData,
  BoardType,
  SwimlaneBy,
  Sprint,
  SprintStatus,
  SprintWithIssues,
  BacklogResponse,
  CreateBoardInput,
  UpdateBoardInput,
  MoveIssueInput,
  CreateSprintInput,
  UpdateSprintInput,
  StartSprintInput,
  CloseSprintInput,
  CloseSprintResult,
  BurndownPoint,
  IncompleteIssueAction,
};

export type BoardDataResponse = BoardData;

export const boardsApi = {
  list: (projectKey: string) =>
    apiClient.get<Board[]>(`/projects/${projectKey}/boards`),

  get: (projectKey: string, boardId: string) =>
    apiClient.get<Board>(`/projects/${projectKey}/boards/${boardId}`),

  getData: (projectKey: string, boardId: string, params?: {
    sprintId?: string;
    swimlaneBy?: SwimlaneBy;
    assigneeId?: string;
    search?: string;
  }) =>
    apiClient.get<BoardData>(`/projects/${projectKey}/boards/${boardId}/data`, { params }),

  create: (projectKey: string, data: CreateBoardInput) =>
    apiClient.post<Board>(`/projects/${projectKey}/boards`, data),

  update: (projectKey: string, boardId: string, data: UpdateBoardInput) =>
    apiClient.patch<Board>(`/projects/${projectKey}/boards/${boardId}`, data),

  updateColumns: (projectKey: string, boardId: string, columns: BoardColumn[]) =>
    apiClient.put<Board>(`/projects/${projectKey}/boards/${boardId}/columns`, { columns }),

  setDefault: (projectKey: string, boardId: string) =>
    apiClient.patch<Board>(`/projects/${projectKey}/boards/${boardId}/default`, {}),

  delete: (projectKey: string, boardId: string) =>
    apiClient.delete(`/projects/${projectKey}/boards/${boardId}`),

  moveIssue: (projectKey: string, boardId: string, data: MoveIssueInput) =>
    apiClient.post<BoardMoveResult>(`/projects/${projectKey}/boards/${boardId}/issues/move`, data),
};

export const sprintsApi = {
  list: (boardId: string, status?: SprintStatus) =>
    apiClient.get<PaginatedResponse<Sprint>>(
      `/boards/${boardId}/sprints`,
      { params: status ? { status } : undefined },
    ),

  get: (boardId: string, sprintId: string) =>
    apiClient.get<Sprint>(`/boards/${boardId}/sprints/${sprintId}`),

  getBacklog: (boardId: string, params?: { search?: string; page?: number; perPage?: number }) =>
    apiClient.get<BacklogResponse>(`/boards/${boardId}/sprints/backlog`, { params }),

  getBacklogIssues: (boardId: string, params?: { search?: string; cursor?: string; pageSize?: number }) =>
    apiClient.get<CursorPaginatedResponse<BoardIssueCard>>(
      `/boards/${boardId}/sprints/backlog-issues`,
      { params },
    ),

  create: (boardId: string, data: CreateSprintInput) =>
    apiClient.post<Sprint>(`/boards/${boardId}/sprints`, data),

  update: (boardId: string, sprintId: string, data: UpdateSprintInput) =>
    apiClient.patch<Sprint>(`/boards/${boardId}/sprints/${sprintId}`, data),

  start: (boardId: string, sprintId: string, data?: StartSprintInput) =>
    apiClient.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/start`, data ?? {}),

  close: (boardId: string, sprintId: string, data: CloseSprintInput) =>
    apiClient.post<CloseSprintResult>(`/boards/${boardId}/sprints/${sprintId}/close`, data),

  delete: (boardId: string, sprintId: string) =>
    apiClient.delete(`/boards/${boardId}/sprints/${sprintId}`),

  addIssues: (boardId: string, sprintId: string, issueIds: string[]) =>
    apiClient.post<AddSprintIssuesResult>(`/boards/${boardId}/sprints/${sprintId}/issues`, { issueIds }),

  removeIssues: (boardId: string, sprintId: string, issueIds: string[]) =>
    apiClient.delete<RemoveSprintIssuesResult>(`/boards/${boardId}/sprints/${sprintId}/issues`, { data: { issueIds } }),

  getBurndown: (boardId: string, sprintId: string) =>
    apiClient.get<BurndownPoint[]>(`/boards/${boardId}/sprints/${sprintId}/burndown`),
};
