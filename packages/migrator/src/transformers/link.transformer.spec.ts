import { describe, it, expect } from 'vitest';
import { mapYtLink, resolveParentYtId } from './link.transformer';

describe('mapYtLink', () => {
  // A directed YouTrack link appears on BOTH endpoints (OUTWARD on the source,
  // INWARD on the target). We create it once from the OUTWARD side; INWARD is
  // skipped so we don't make two rows (BLOCKS(A→B) + DEPENDS_ON(B→A)) for one
  // relationship — the target renders the inverse perspective from the one row.
  it('maps Depend OUTWARD to BLOCKS and skips INWARD (created from the other side)', () => {
    expect(mapYtLink('Depend', 'OUTWARD')).toBe('BLOCKS');
    expect(mapYtLink('Depend', 'INWARD')).toBeNull();
  });

  it('maps Duplicate OUTWARD to DUPLICATES and skips INWARD', () => {
    expect(mapYtLink('Duplicate', 'OUTWARD')).toBe('DUPLICATES');
    expect(mapYtLink('Duplicate', 'INWARD')).toBeNull();
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
