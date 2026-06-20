import { canonicalTiptapHash } from './canonical-hash';

describe('canonicalTiptapHash', () => {
  it('produces the same hash regardless of object key order', () => {
    const a = { type: 'doc', attrs: { a: 1, b: 2 }, content: [] };
    const b = { content: [], attrs: { b: 2, a: 1 }, type: 'doc' };

    expect(canonicalTiptapHash(a)).toBe(canonicalTiptapHash(b));
  });

  it('produces different hashes for different content', () => {
    const a = { type: 'doc', content: [{ type: 'paragraph', text: 'one' }] };
    const b = { type: 'doc', content: [{ type: 'paragraph', text: 'two' }] };

    expect(canonicalTiptapHash(a)).not.toBe(canonicalTiptapHash(b));
  });

  it('is sensitive to array order (content ordering is meaningful)', () => {
    const a = { type: 'doc', content: [{ text: 'a' }, { text: 'b' }] };
    const b = { type: 'doc', content: [{ text: 'b' }, { text: 'a' }] };

    expect(canonicalTiptapHash(a)).not.toBe(canonicalTiptapHash(b));
  });
});
