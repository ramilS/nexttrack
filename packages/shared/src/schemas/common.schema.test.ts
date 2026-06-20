import { describe, it, expect } from 'vitest';
import { uniqueUuidArray } from './common.schema';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('uniqueUuidArray', () => {
  it('accepts an array of distinct uuids', () => {
    expect(uniqueUuidArray().safeParse([A, B]).success).toBe(true);
  });

  it('rejects duplicate uuids', () => {
    const result = uniqueUuidArray().safeParse([A, A]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Duplicate values not allowed');
    }
  });

  it('rejects non-uuid strings', () => {
    expect(uniqueUuidArray().safeParse(['not-a-uuid']).success).toBe(false);
  });

  it('enforces the min bound', () => {
    expect(uniqueUuidArray({ min: 1 }).safeParse([]).success).toBe(false);
    expect(uniqueUuidArray({ min: 1 }).safeParse([A]).success).toBe(true);
  });

  it('enforces the max bound', () => {
    expect(uniqueUuidArray({ max: 1 }).safeParse([A, B]).success).toBe(false);
  });

  it('accepts an empty array when no min is set', () => {
    expect(uniqueUuidArray().safeParse([]).success).toBe(true);
  });
});
