import { Prisma } from '@prisma/client';
import { encodeCursor, decodeCursor } from './cursor';
import type { CursorMeta } from '@repo/shared';

// ─── Simple cursor (single sort field + id tiebreaker) ────────────────

interface SimpleCursorInput {
  cursor?: string;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

interface SimpleCursorArgs {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

/**
 * Build Prisma findMany args for simple cursor pagination.
 * Uses Prisma's native `cursor` + `skip: 1` + `take: N+1` pattern.
 */
export function buildSimpleCursorArgs(input: SimpleCursorInput): SimpleCursorArgs {
  const { cursor, pageSize } = input;

  if (!cursor) {
    return { take: pageSize + 1 };
  }

  const decoded = decodeCursor<{ id: string }>(cursor);

  return {
    cursor: { id: decoded.id },
    skip: 1,
    take: pageSize + 1,
  };
}

/**
 * Build cursor-paginated response from query results.
 * Items should be queried with `take: pageSize + 1`.
 */
export function buildSimpleCursorResult<T extends { id: string }>(
  items: T[],
  pageSize: number,
): { items: T[]; meta: CursorMeta } {
  const hasNextPage = items.length > pageSize;
  const resultItems = hasNextPage ? items.slice(0, pageSize) : items;
  const lastItem = resultItems[resultItems.length - 1];

  return {
    items: resultItems,
    meta: {
      nextCursor: hasNextPage && lastItem
        ? encodeCursor({ id: lastItem.id })
        : null,
      pageSize,
      hasNextPage,
    },
  };
}

// ─── Keyset cursor (multi-field sort + id tiebreaker) ─────────────────

interface KeysetCursorInput {
  cursor?: string;
  pageSize: number;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * Build a WHERE clause for keyset pagination with composite sort.
 * Implements: (sortField, id) < (cursorSort, cursorId) for DESC
 *         or: (sortField, id) > (cursorSort, cursorId) for ASC
 *
 * Handles NULL sort values: NULLs sort last in both directions.
 */
export function buildKeysetWhere(
  input: KeysetCursorInput,
): Prisma.IssueWhereInput | undefined {
  const { cursor, sortField, sortOrder } = input;
  if (!cursor) return undefined;

  const decoded = decodeCursor<{ id: string; [key: string]: unknown }>(cursor);
  const cursorSortValue = decoded[sortField];
  const cursorId = decoded.id;

  const isDesc = sortOrder === 'desc';
  const sortOp = isDesc ? 'lt' : 'gt';
  const idOp = isDesc ? 'lt' : 'gt';

  // Computed-key filters can't be expressed as a typed Prisma where literal, so
  // each fragment is asserted to the where type once (single cast, from unknown).
  const fragment = (value: unknown): Prisma.IssueWhereInput =>
    value as Prisma.IssueWhereInput;

  // NULL sort values sort last: within the NULL group, paginate by id only.
  if (cursorSortValue === null || cursorSortValue === undefined) {
    return {
      AND: [fragment({ [sortField]: null }), { id: { [idOp]: cursorId } }],
    };
  }

  const conditions: Prisma.IssueWhereInput[] = [
    fragment({ [sortField]: { [sortOp]: cursorSortValue } }),
    {
      AND: [
        fragment({ [sortField]: cursorSortValue }),
        { id: { [idOp]: cursorId } },
      ],
    },
  ];

  // DESC puts NULLs last, so they fall after the current cursor.
  if (isDesc) {
    conditions.push(fragment({ [sortField]: null }));
  }

  return { OR: conditions };
}

/**
 * Build keyset cursor result from query results.
 */
export function buildKeysetCursorResult<T extends { id: string; [key: string]: unknown }>(
  items: T[],
  pageSize: number,
  sortField: string,
): { items: T[]; meta: CursorMeta } {
  const hasNextPage = items.length > pageSize;
  const resultItems = hasNextPage ? items.slice(0, pageSize) : items;
  const lastItem = resultItems[resultItems.length - 1];

  return {
    items: resultItems,
    meta: {
      nextCursor: hasNextPage && lastItem
        ? encodeCursor({ id: lastItem.id, [sortField]: lastItem[sortField] ?? null })
        : null,
      pageSize,
      hasNextPage,
    },
  };
}
