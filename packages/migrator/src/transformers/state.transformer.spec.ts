import { describe, it, expect } from 'vitest';
import { mapStatesToStatuses } from './state.transformer';

describe('mapStatesToStatuses', () => {
  it('marks the first state initial/UNSTARTED and resolved states DONE', () => {
    const result = mapStatesToStatuses([
      { id: 's0', name: 'Open', isResolved: false },
      { id: 's1', name: 'In Progress', isResolved: false },
      { id: 's2', name: 'Fixed', isResolved: true },
    ]);

    expect(result).toEqual([
      { name: 'Open', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0, color: undefined },
      { name: 'In Progress', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 1, color: undefined },
      { name: 'Fixed', category: 'DONE', isInitial: false, isResolved: true, ordinal: 2, color: undefined },
    ]);
  });

  it('returns an empty list for no states', () => {
    expect(mapStatesToStatuses([])).toEqual([]);
  });
});
