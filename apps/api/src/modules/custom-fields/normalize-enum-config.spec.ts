import { normalizeEnumConfig } from './normalize-enum-config';

describe('normalizeEnumConfig', () => {
  it('normalizes string options to objects with stable UUID-compatible ids', () => {
    const { config, changed } = normalizeEnumConfig('field-1', {
      options: ['Production', 'Staging', 'Development'],
    });

    expect(changed).toBe(true);
    const options = config.options as Array<{ id: string; name: string; color: string | null; ordinal: number }>;
    expect(options).toHaveLength(3);
    expect(options[0]).toMatchObject({ name: 'Production', color: null, ordinal: 0 });
    expect(options[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(options[1]).toMatchObject({ name: 'Staging', color: null, ordinal: 1 });
    expect(options[2]).toMatchObject({ name: 'Development', color: null, ordinal: 2 });
  });

  it('normalizes options missing an id', () => {
    const { config, changed } = normalizeEnumConfig('field-1', {
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

    const { config, changed } = normalizeEnumConfig('field-1', original);

    expect(changed).toBe(false);
    expect(config).toBe(original);
  });

  it('returns unchanged config when there are no options', () => {
    const original = { maxLength: 100 };
    const { config, changed } = normalizeEnumConfig('field-1', original);
    expect(changed).toBe(false);
    expect(config).toBe(original);
  });

  it('handles null config', () => {
    const { config, changed } = normalizeEnumConfig('field-1', null);
    expect(changed).toBe(false);
    expect(config).toEqual({});
  });

  it('handles mixed string and object options', () => {
    const { config, changed } = normalizeEnumConfig('field-1', {
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

  it('uses field identity to keep legacy option ids stable without sharing them across fields', () => {
    const config = { options: ['Production'] };

    const first = normalizeEnumConfig('field-1', config);
    const second = normalizeEnumConfig('field-1', config);
    const otherField = normalizeEnumConfig('field-2', config);

    const firstId = (first.config.options as Array<{ id: string }>)[0].id;
    expect((second.config.options as Array<{ id: string }>)[0].id).toBe(firstId);
    expect((otherField.config.options as Array<{ id: string }>)[0].id).not.toBe(firstId);
  });
});
