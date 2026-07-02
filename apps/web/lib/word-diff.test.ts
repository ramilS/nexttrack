import { describe, it, expect } from 'vitest';
import { wordDiff, type DiffPart } from './word-diff';

const render = (parts: DiffPart[]): string =>
  parts
    .map((p) => (p.type === 'equal' ? p.value : `[${p.type[0]}:${p.value}]`))
    .join('');

describe('wordDiff', () => {
  it('marks an added trailing word as added, keeping the shared prefix equal', () => {
    const parts = wordDiff('hello world', 'hello brave world');
    expect(parts.filter((p) => p.type === 'added').map((p) => p.value.trim())).toEqual([
      'brave',
    ]);
    expect(parts.some((p) => p.type === 'removed')).toBe(false);
  });

  it('marks a removed word as removed', () => {
    const parts = wordDiff('hello brave world', 'hello world');
    expect(parts.filter((p) => p.type === 'removed').map((p) => p.value.trim())).toEqual([
      'brave',
    ]);
  });

  it('treats a replacement as removed + added', () => {
    const parts = wordDiff('the cat sat', 'the dog sat');
    expect(parts.find((p) => p.type === 'removed')?.value.trim()).toBe('cat');
    expect(parts.find((p) => p.type === 'added')?.value.trim()).toBe('dog');
  });

  it('re-joining equal + removed reproduces the original "from"', () => {
    const from = 'first draft of the text';
    const to = 'second draft here';
    const fromAgain = wordDiff(from, to)
      .filter((p) => p.type !== 'added')
      .map((p) => p.value)
      .join('');
    expect(fromAgain).toBe(from);
  });

  it('is all-equal when texts are identical', () => {
    const parts = wordDiff('same text', 'same text');
    expect(parts).toEqual([{ value: 'same text', type: 'equal' }]);
  });

  it('handles an empty "from" as fully added (first draft)', () => {
    const parts = wordDiff('', 'brand new');
    expect(render(parts)).toBe('[a:brand new]');
  });
});
