import { describe, it, expect } from 'vitest';
import { IdMapService } from './id-map.service';

describe('IdMapService.getAllUserIds', () => {
  it('returns all registered target user ids', () => {
    const idMap = new IdMapService();
    idMap.registerUser('yt-1', 'nt-1');
    idMap.registerUser('yt-2', 'nt-2');

    expect(idMap.getAllUserIds().sort()).toEqual(['nt-1', 'nt-2']);
  });

  it('returns an empty array when no users are registered', () => {
    expect(new IdMapService().getAllUserIds()).toEqual([]);
  });
});
