import { normalizeEnumConfig } from './normalize-enum-config';

describe('normalizeEnumConfig', () => {
  it('normalizes string options to objects with generated ids', () => {
    const { config, changed } = normalizeEnumConfig({
      options: ['Production', 'Staging', 'Development'],
    });

    expect(changed).toBe(true);
    const options = config.options as Array<{ id: string; name: string; color: string | null; ordinal: number }>;
    expect(options).toHaveLength(3);
    expect(options[0]).toMatchObject({ name: 'Production', color: null, ordinal: 0 });
    expect(options[0].id).toBeTruthy();
    expect(options[1]).toMatchObject({ name: 'Staging', color: null, ordinal: 1 });
    expect(options[2]).toMatchObject({ name: 'Development', color: null, ordinal: 2 });
  });

  it('normalizes options missing an id', () => {
    const { config, changed } = normalizeEnumConfig({
      options: [
        { name: 'Open', color: 'green' },
        { name: 'Closed', color: 'red' },
      ],
    });

    expect(changed).toBe(true);
    const options = config.options as Array<{ id: string; name: string; color: string | null }>;
    expect(options[0]).toMatchObject({ name: 'Open', color: 'green' });
    expect(options[0].id).toBeTruthy();
    expect(options[1]).toMatchObject({ name: 'Closed', color: 'red' });
  });

  it('returns unchanged config when already normalized', () => {
    const original = {
      options: [
        { id: 'uuid-1', name: 'A', color: null, ordinal: 0 },
        { id: 'uuid-2', name: 'B', color: 'blue', ordinal: 1 },
      ],
    };

    const { config, changed } = normalizeEnumConfig(original);

    expect(changed).toBe(false);
    expect(config).toBe(original);
  });

  it('returns unchanged config when there are no options', () => {
    const original = { maxLength: 100 };
    const { config, changed } = normalizeEnumConfig(original);
    expect(changed).toBe(false);
    expect(config).toBe(original);
  });

  it('handles null config', () => {
    const { config, changed } = normalizeEnumConfig(null);
    expect(changed).toBe(false);
    expect(config).toEqual({});
  });

  it('handles mixed string and object options', () => {
    const { config, changed } = normalizeEnumConfig({
      options: [
        'LegacyOption',
        { id: 'existing-id', name: 'ProperOption', color: 'blue', ordinal: 5 },
      ],
    });

    expect(changed).toBe(true);
    const options = config.options as Array<{ id: string; name: string; color: string | null; ordinal: number }>;
    expect(options[0]).toMatchObject({ name: 'LegacyOption', ordinal: 0 });
    expect(options[0].id).toBeTruthy();
    expect(options[1]).toMatchObject({
      id: 'existing-id',
      name: 'ProperOption',
      color: 'blue',
      ordinal: 5,
    });
  });
});
