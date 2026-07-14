import { describe, expect, it } from 'vitest';
import { canonicalEntity } from './manifest.types';
import { sourceChecksum, stableJson } from './stable-checksum';

describe('stable checksum', () => {
  it('sorts object keys recursively but preserves array order', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: [3, 1] } })).toBe(
      '{"a":{"x":[3,1],"y":2},"z":1}',
    );
  });

  it('produces the same checksum for equivalent object insertion order', () => {
    expect(sourceChecksum({ a: 1, b: 2 })).toBe(
      sourceChecksum({ b: 2, a: 1 }),
    );
  });

  it('changes when relationship order changes', () => {
    expect(sourceChecksum({ ids: ['a', 'b'] })).not.toBe(
      sourceChecksum({ ids: ['b', 'a'] }),
    );
  });

  it('omits undefined object properties with JSON semantics', () => {
    expect(stableJson({ present: null, omitted: undefined })).toBe(
      '{"present":null}',
    );
  });

  it.each([
    [null, 'null'],
    [true, 'true'],
    [42, '42'],
    ['value', '"value"'],
  ])('serializes JSON primitive %j', (value, expected) => {
    expect(stableJson(value)).toBe(expected);
  });

  it('creates a canonical entity with a payload checksum', () => {
    const payload = { name: 'Example', relationships: ['b', 'a'] };

    expect(
      canonicalEntity(
        {
          sourceSystem: 'youtrack-cloud',
          entityType: 'issue',
          sourceId: 'YT-1',
        },
        payload,
      ),
    ).toEqual({
      sourceSystem: 'youtrack-cloud',
      entityType: 'issue',
      sourceId: 'YT-1',
      payload,
      checksum: sourceChecksum(payload),
    });
  });
});
