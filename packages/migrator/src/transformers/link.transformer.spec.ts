import { describe, it, expect } from 'vitest';
import { mapYtLink, resolveParentYtId } from './link.transformer';

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

describe('resolveParentYtId', () => {
  const parentLink = {
    direction: 'INWARD' as const,
    linkType: { name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of' },
    issues: [{ id: 'yt-parent' }],
  };

  it('returns the parent id from the INWARD Subtask link', () => {
    expect(resolveParentYtId([parentLink])).toBe('yt-parent');
  });

  it('matches by presentation ("subtask of"/"parent for") when the type name differs', () => {
    const renamed = {
      ...parentLink,
      linkType: { name: 'Aggregation', sourceToTarget: 'parent for', targetToSource: 'subtask of' },
    };
    expect(resolveParentYtId([renamed])).toBe('yt-parent');
  });

  it('ignores the OUTWARD Subtask side (those are children, not the parent)', () => {
    const childLink = { ...parentLink, direction: 'OUTWARD' as const, issues: [{ id: 'yt-child' }] };
    expect(resolveParentYtId([childLink])).toBeNull();
  });

  it('ignores non-Subtask link types', () => {
    const relates = { ...parentLink, linkType: { name: 'Relates' } };
    expect(resolveParentYtId([relates as never])).toBeNull();
  });

  it('returns null for no links', () => {
    expect(resolveParentYtId(undefined)).toBeNull();
    expect(resolveParentYtId([])).toBeNull();
  });
});
