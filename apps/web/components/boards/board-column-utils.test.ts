import { describe, it, expect } from 'vitest';
import type { BoardColumn } from '@/lib/api/boards.api';
import {
  assignStatusToColumn,
  removeStatusFromColumn,
  dropEmptyColumns,
  unassignedStatusIds,
} from './board-column-utils';

const cols: BoardColumn[] = [
  { id: 'a', name: 'A', statusIds: ['s1', 's2'], ordinal: 0 },
  { id: 'b', name: 'B', statusIds: ['s3'], ordinal: 1 },
];

describe('assignStatusToColumn', () => {
  it('moves a status into the target column and removes it from its old column', () => {
    const result = assignStatusToColumn(cols, 'b', 's2');
    expect(result.find((c) => c.id === 'a')!.statusIds).toEqual(['s1']);
    expect(result.find((c) => c.id === 'b')!.statusIds).toEqual(['s3', 's2']);
  });

  it('is a no-op when the status is already in the target column', () => {
    const result = assignStatusToColumn(cols, 'a', 's1');
    expect(result.find((c) => c.id === 'a')!.statusIds).toEqual(['s1', 's2']);
  });

  it('does not mutate the input array', () => {
    assignStatusToColumn(cols, 'b', 's2');
    expect(cols.find((c) => c.id === 'a')!.statusIds).toEqual(['s1', 's2']);
  });
});

describe('removeStatusFromColumn', () => {
  it('removes the status only from the named column', () => {
    const result = removeStatusFromColumn(cols, 'a', 's1');
    expect(result.find((c) => c.id === 'a')!.statusIds).toEqual(['s2']);
  });
});

describe('dropEmptyColumns', () => {
  it('removes columns with no statuses', () => {
    const withEmpty: BoardColumn[] = [
      ...cols,
      { id: 'c', name: 'C', statusIds: [], ordinal: 2 },
    ];
    expect(dropEmptyColumns(withEmpty).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('unassignedStatusIds', () => {
  it('returns statuses not present in any column', () => {
    expect(unassignedStatusIds(cols, ['s1', 's2', 's3', 's4'])).toEqual(['s4']);
  });
  it('returns empty when every status is covered', () => {
    expect(unassignedStatusIds(cols, ['s1', 's2', 's3'])).toEqual([]);
  });
});
