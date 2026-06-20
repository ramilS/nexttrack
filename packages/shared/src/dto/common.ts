/**
 * Shared DTO types used across multiple entities.
 */

/** Lightweight user object returned in issue assignee/reporter, comments, etc. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** Compact user reference without email (used in attachments, etc.) */
export interface UserRef {
  id: string;
  name: string;
}

/** Pagination metadata returned with all paginated responses. */
export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Generic paginated response wrapper. */
export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Cursor-based pagination metadata. */
export interface CursorMeta {
  nextCursor: string | null;
  pageSize: number;
  hasNextPage: boolean;
}

/** Generic cursor-paginated response wrapper. */
export interface CursorPaginatedResponse<T> {
  items: T[];
  meta: CursorMeta;
}
