import { envBoolean, envBooleanOptional, envTrustProxy, productionSecret } from './helpers';

describe('productionSecret', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts a strong secret in any environment', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      productionSecret(32).parse('a-strong-32-char-prod-secret-12345'),
    ).not.toThrow();
  });

  it('rejects placeholder secrets in production', () => {
    process.env.NODE_ENV = 'production';
    const placeholders = [
      'change_me_in_production_min_32_chars',
      'change-me-very-long-random-secret-only-for-migration',
      'your_secret_change_me_now_please_32',
      'placeholder_secret_min_32_characters',
    ];
    for (const value of placeholders) {
      expect(() => productionSecret(32).parse(value)).toThrow(/placeholder/i);
    }
  });

  it('allows placeholder secrets outside production', () => {
    for (const env of ['development', 'test', 'staging', undefined]) {
      process.env.NODE_ENV = env;
      expect(() =>
        productionSecret(32).parse('change_me_in_production_min_32_chars'),
      ).not.toThrow();
    }
  });

  it('still enforces minimum length', () => {
    process.env.NODE_ENV = 'development';
    expect(() => productionSecret(32).parse('short')).toThrow(/>=32 characters/);
  });

  it('case-insensitive placeholder detection', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      productionSecret(32).parse('CHANGE_ME_IN_PRODUCTION_MIN_32_CHARS'),
    ).toThrow(/placeholder/i);
  });
});

describe('envBoolean', () => {
  it("parses 'true' as true and 'false' as false", () => {
    expect(envBoolean(true).parse('false')).toBe(false);
    expect(envBoolean(false).parse('true')).toBe(true);
  });

  it('falls back to the default when the variable is unset', () => {
    expect(envBoolean(true).parse(undefined)).toBe(true);
    expect(envBoolean(false).parse(undefined)).toBe(false);
  });

  it('rejects anything that is not exactly true/false', () => {
    for (const value of ['1', '0', 'yes', 'no', 'TRUE', '']) {
      expect(() => envBoolean(false).parse(value)).toThrow();
    }
  });
});

describe('envBooleanOptional', () => {
  it("parses 'true'/'false' and keeps undefined as undefined", () => {
    expect(envBooleanOptional().parse('true')).toBe(true);
    expect(envBooleanOptional().parse('false')).toBe(false);
    expect(envBooleanOptional().parse(undefined)).toBeUndefined();
  });

  it('rejects non-boolean strings', () => {
    expect(() => envBooleanOptional().parse('enabled')).toThrow();
  });
});

describe('envTrustProxy', () => {
  it('defaults to false when unset, matching Express’s own default', () => {
    expect(envTrustProxy().parse(undefined)).toBe(false);
  });

  it("parses the literal strings 'true' and 'false'", () => {
    expect(envTrustProxy().parse('true')).toBe(true);
    expect(envTrustProxy().parse('false')).toBe(false);
  });

  it('parses a non-negative integer as a hop count', () => {
    expect(envTrustProxy().parse('1')).toBe(1);
    expect(envTrustProxy().parse('0')).toBe(0);
    expect(envTrustProxy().parse('3')).toBe(3);
  });

  it('rejects a negative or non-integer hop count', () => {
    expect(() => envTrustProxy().parse('-1')).toThrow();
    expect(() => envTrustProxy().parse('1.5')).toThrow();
  });

  it('rejects a value that is neither a boolean literal nor a number', () => {
    expect(() => envTrustProxy().parse('loopback')).toThrow();
  });
});
