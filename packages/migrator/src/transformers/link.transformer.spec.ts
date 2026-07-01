import { describe, it, expect } from 'vitest';
import { mapYtLink } from './link.transformer';

describe('mapYtLink', () => {
  it('maps Depend outward to BLOCKS and inward to IS_BLOCKED_BY', () => {
    expect(mapYtLink('Depend', 'OUTWARD')).toBe('BLOCKS');
    expect(mapYtLink('Depend', 'INWARD')).toBe('IS_BLOCKED_BY');
  });

  it('maps Duplicate both directions', () => {
    expect(mapYtLink('Duplicate', 'OUTWARD')).toBe('DUPLICATES');
    expect(mapYtLink('Duplicate', 'INWARD')).toBe('IS_DUPLICATED_BY');
  });

  it('emits a symmetric Relates link once (OUTWARD/BOTH only)', () => {
    expect(mapYtLink('Relates', 'BOTH')).toBe('RELATES_TO');
    expect(mapYtLink('Relates', 'OUTWARD')).toBe('RELATES_TO');
    expect(mapYtLink('Relates', 'INWARD')).toBeNull();
  });

  it('skips Subtask (handled by the parent-links phase)', () => {
    expect(mapYtLink('Subtask', 'OUTWARD')).toBeNull();
    expect(mapYtLink('Subtask', 'INWARD')).toBeNull();
  });

  it('skips unknown link types', () => {
    expect(mapYtLink('Frobnicate', 'OUTWARD')).toBeNull();
  });
});
