import { describe, it, expect } from 'vitest';
import { mapTagColor } from './tag.transformer';

describe('mapTagColor', () => {
  it('keeps a 6-digit hex background', () => {
    expect(mapTagColor({ background: '#ffe3e3' })).toBe('#ffe3e3');
  });

  it('expands a 3-digit hex background to 6 digits', () => {
    expect(mapTagColor({ background: '#f0a' })).toBe('#ff00aa');
  });

  it('falls back to gray for missing or non-hex colors', () => {
    expect(mapTagColor(undefined)).toBe('gray');
    expect(mapTagColor(null)).toBe('gray');
    expect(mapTagColor({})).toBe('gray');
    expect(mapTagColor({ background: 'tomato' })).toBe('gray');
    expect(mapTagColor('red')).toBe('gray');
  });
});
