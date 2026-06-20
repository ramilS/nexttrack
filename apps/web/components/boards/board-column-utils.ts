import type { BoardColumn } from '@/lib/api/boards.api';

export function assignStatusToColumn(
  columns: BoardColumn[],
  targetColumnId: string,
  statusId: string,
): BoardColumn[] {
  return columns.map((col) => {
    if (col.id === targetColumnId) {
      return col.statusIds.includes(statusId)
        ? col
        : { ...col, statusIds: [...col.statusIds, statusId] };
    }
    if (col.statusIds.includes(statusId)) {
      return { ...col, statusIds: col.statusIds.filter((id) => id !== statusId) };
    }
    return col;
  });
}

export function removeStatusFromColumn(
  columns: BoardColumn[],
  columnId: string,
  statusId: string,
): BoardColumn[] {
  return columns.map((col) =>
    col.id === columnId
      ? { ...col, statusIds: col.statusIds.filter((id) => id !== statusId) }
      : col,
  );
}

export function dropEmptyColumns(columns: BoardColumn[]): BoardColumn[] {
  return columns.filter((col) => col.statusIds.length > 0);
}

export function unassignedStatusIds(
  columns: BoardColumn[],
  allStatusIds: string[],
): string[] {
  const assigned = new Set(columns.flatMap((col) => col.statusIds));
  return allStatusIds.filter((id) => !assigned.has(id));
}
