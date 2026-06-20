import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
  buildKeysetWhere,
  buildKeysetCursorResult,
} from './cursor-paginate';
import { encodeCursor } from './cursor';

describe('cursor-paginate', () => {
  // ─── Simple cursor ───────────────────────────────────────

  describe('buildSimpleCursorArgs', () => {
    it('should return take: pageSize+1 when no cursor', () => {
      const result = buildSimpleCursorArgs({ pageSize: 20 });
      expect(result).toEqual({ take: 21 });
    });

    it('should return cursor + skip + take when cursor provided', () => {
      const cursor = encodeCursor({ id: 'abc-123' });
      const result = buildSimpleCursorArgs({ cursor, pageSize: 20 });
      expect(result).toEqual({
        cursor: { id: 'abc-123' },
        skip: 1,
        take: 21,
      });
    });
  });

  describe('buildSimpleCursorResult', () => {
    it('should return hasNextPage=false when items <= pageSize', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const result = buildSimpleCursorResult(items, 5);
      expect(result.items).toHaveLength(2);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.pageSize).toBe(5);
    });

    it('should return hasNextPage=true and trim when items > pageSize', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const result = buildSimpleCursorResult(items, 2);
      expect(result.items).toHaveLength(2);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.nextCursor).toBeTruthy();
      expect(result.meta.pageSize).toBe(2);
    });

    it('should handle empty results', () => {
      const result = buildSimpleCursorResult([], 10);
      expect(result.items).toHaveLength(0);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });
  });

  // ─── Keyset cursor ──────────────────────────────────────

  describe('buildKeysetWhere', () => {
    it('should return undefined when no cursor', () => {
      const result = buildKeysetWhere({
        pageSize: 20,
        sortField: 'priority',
        sortOrder: 'desc',
      });
      expect(result).toBeUndefined();
    });

    it('should build DESC keyset WHERE with non-null sort value', () => {
      const cursor = encodeCursor({ id: 'x', priority: 'HIGH' });
      const result = buildKeysetWhere({
        cursor,
        pageSize: 20,
        sortField: 'priority',
        sortOrder: 'desc',
      });
      expect(result).toEqual({
        OR: [
          { priority: { lt: 'HIGH' } },
          { AND: [{ priority: 'HIGH' }, { id: { lt: 'x' } }] },
          { priority: null },
        ],
      });
    });

    it('should build ASC keyset WHERE with non-null sort value', () => {
      const cursor = encodeCursor({ id: 'x', createdAt: '2026-01-01' });
      const result = buildKeysetWhere({
        cursor,
        pageSize: 20,
        sortField: 'createdAt',
        sortOrder: 'asc',
      });
      expect(result).toEqual({
        OR: [
          { createdAt: { gt: '2026-01-01' } },
          { AND: [{ createdAt: '2026-01-01' }, { id: { gt: 'x' } }] },
        ],
      });
    });

    it('should handle null sort value (NULLs-last region)', () => {
      const cursor = encodeCursor({ id: 'x', dueDate: null });
      const result = buildKeysetWhere({
        cursor,
        pageSize: 20,
        sortField: 'dueDate',
        sortOrder: 'desc',
      });
      expect(result).toEqual({
        AND: [{ dueDate: null }, { id: { lt: 'x' } }],
      });
    });
  });

  describe('buildKeysetCursorResult', () => {
    it('should build cursor from last item sort field', () => {
      const items = [
        { id: '1', priority: 'HIGH' },
        { id: '2', priority: 'MEDIUM' },
        { id: '3', priority: 'LOW' },
      ];
      const result = buildKeysetCursorResult(items, 2, 'priority');
      expect(result.items).toHaveLength(2);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.nextCursor).toBeTruthy();
    });

    it('should handle null sort values in cursor', () => {
      const items = [{ id: '1', dueDate: null }];
      const result = buildKeysetCursorResult(items, 5, 'dueDate');
      expect(result.items).toHaveLength(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });
  });
});
