import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey, hasPlausibleApiKeyShape } from './api-key-token';

describe('api key token', () => {
  it('generates a prefixed key whose hash is the SHA-256 hex of the raw value', () => {
    const { raw, prefix, hash } = generateApiKey();

    expect(raw.startsWith('nt_')).toBe(true);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hash).toHaveLength(64);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it('never returns the same raw key twice', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey().raw));
    expect(keys.size).toBe(100);
  });

  it('hashes deterministically so lookup by hash finds the same row', () => {
    expect(hashApiKey('nt_fixed_value')).toBe(hashApiKey('nt_fixed_value'));
    expect(hashApiKey('nt_fixed_value')).not.toBe(hashApiKey('nt_other_value'));
  });

  it('accepts the shape of every key it generates, across 100 samples', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(hasPlausibleApiKeyShape(generateApiKey().raw)).toBe(true);
    }
  });

  it.each([
    ['wrong namespace', `xx_${generateApiKey().raw.slice(3)}`],
    ['one character short', generateApiKey().raw.slice(0, -1)],
    ['one character long', `${generateApiKey().raw}x`],
    ['empty string', ''],
  ])('rejects a %s value', (_label, candidate) => {
    expect(hasPlausibleApiKeyShape(candidate)).toBe(false);
  });
});
