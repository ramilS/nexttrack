import { createHash } from 'node:crypto';
import type { StartMigrationRunInput } from './migration-manifest.repository';

const FINGERPRINT_VERSION = 'migration-run-fingerprint-v1';

type FingerprintInput = Pick<
  StartMigrationRunInput,
  | 'sourceSystem'
  | 'sourceTenant'
  | 'sourceUrl'
  | 'targetUrl'
  | 'configHash'
  | 'specVersion'
  | 'exclusionVersion'
>;

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, '');
}

function lengthPrefix(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`;
}

export function buildMigrationRunFingerprint(input: FingerprintInput): {
  sourceTenant: string;
  sourceUrl: string;
  targetUrl: string;
  fingerprintHash: string;
} {
  const sourceTenant = input.sourceTenant.trim().toLowerCase();
  const sourceUrl = normalizeUrl(input.sourceUrl);
  const targetUrl = normalizeUrl(input.targetUrl);
  const canonical = [
    FINGERPRINT_VERSION,
    input.sourceSystem,
    sourceTenant,
    sourceUrl,
    targetUrl,
    input.configHash,
    input.specVersion,
    input.exclusionVersion,
  ]
    .map(lengthPrefix)
    .join('');

  return {
    sourceTenant,
    sourceUrl,
    targetUrl,
    fingerprintHash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
  };
}
