import { describe, it, expect } from 'vitest';
import {
  unsupportedMigrationFlags,
  registerStatusMap,
  registerCustomFieldMap,
} from './migrate.command';
import { IdMapService } from '../id-map/id-map.service';

describe('registerStatusMap', () => {
  it('registers target status ids keyed by status name', () => {
    const idMap = new IdMapService();

    registerStatusMap(idMap, 'DEVX', [
      { id: 'st-1', name: 'Open' },
      { id: 'st-2', name: 'Done' },
    ]);

    expect(idMap.getStatusId('DEVX', 'Open')).toBe('st-1');
    expect(idMap.getStatusId('DEVX', 'Done')).toBe('st-2');
  });
});

describe('registerCustomFieldMap', () => {
  it('registers custom fields and their enum options by name', () => {
    const idMap = new IdMapService();

    registerCustomFieldMap(idMap, [
      { id: 'f1', name: 'Severity', options: [{ id: 'o1', name: 'High' }] },
      { id: 'f2', name: 'Notes', options: [] },
    ]);

    expect(idMap.getCustomFieldId('Severity')).toBe('f1');
    expect(idMap.getEnumOptionId('Severity', 'High')).toBe('o1');
    expect(idMap.getCustomFieldId('Notes')).toBe('f2');
  });
});

describe('unsupportedMigrationFlags', () => {
  it('returns empty — boards and time-tracking both load now', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: true, withTimeTracking: true }),
    ).toEqual([]);
  });
});
