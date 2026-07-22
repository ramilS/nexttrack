import { buildMigrationRunFingerprint } from './migration-run-fingerprint';

describe('buildMigrationRunFingerprint', () => {
  it('normalizes URLs and produces the stable v1 fingerprint', () => {
    expect(
      buildMigrationRunFingerprint({
        sourceSystem: 'youtrack-cloud',
        sourceTenant: ' EXAMPLE.youtrack.cloud ',
        sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
        targetUrl: 'http://LOCALHOST:3001/',
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
      }),
    ).toEqual({
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      fingerprintHash:
        '5d401d386303b95e2c3120e5fef7b296d51498d62b0a5be174e49994327dd886',
    });
  });

  it('changes when any immutable fingerprint field changes', () => {
    const base = {
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      configHash: 'a'.repeat(64),
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    };
    const original = buildMigrationRunFingerprint(base).fingerprintHash;
    const changes = [
      { sourceSystem: 'other-system' },
      { sourceTenant: 'other.example' },
      { sourceUrl: 'https://other.example' },
      { targetUrl: 'https://target.example' },
      { configHash: 'b'.repeat(64) },
      { specVersion: 'other-spec' },
      { exclusionVersion: 'other-exclusion' },
    ];

    for (const change of changes) {
      expect(
        buildMigrationRunFingerprint({ ...base, ...change }).fingerprintHash,
      ).not.toBe(original);
    }
  });
});
