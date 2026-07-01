import { describe, it, expect } from 'vitest';
import { IdMapService } from './id-map.service';

describe('IdMapService.getUserEntries', () => {
  it('returns YouTrack-id → target-id pairs for all registered users', () => {
    const idMap = new IdMapService();
    idMap.registerUser('yt-1', 'nt-1');
    idMap.registerUser('yt-2', 'nt-2');

    expect(idMap.getUserEntries()).toEqual([
      { ytId: 'yt-1', targetId: 'nt-1' },
      { ytId: 'yt-2', targetId: 'nt-2' },
    ]);
  });

  it('returns an empty array when no users are registered', () => {
    expect(new IdMapService().getUserEntries()).toEqual([]);
  });
});

describe('IdMapService fallback user', () => {
  it('survives a serialize/deserialize round-trip (checkpoint resume)', () => {
    const idMap = new IdMapService();
    idMap.setFallbackUserId('nt-ghost');

    const restored = IdMapService.deserialize(idMap.serialize());

    expect(restored.getFallbackUserId()).toBe('nt-ghost');
  });

  it('is null by default and after deserializing an old checkpoint', () => {
    expect(new IdMapService().getFallbackUserId()).toBeNull();
    expect(IdMapService.deserialize({}).getFallbackUserId()).toBeNull();
  });
});
