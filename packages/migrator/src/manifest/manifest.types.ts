import { sourceChecksum } from './stable-checksum';

export interface SourceIdentity {
  sourceSystem: 'youtrack-cloud';
  entityType: string;
  sourceId: string;
}

export interface CanonicalEntity<T> extends SourceIdentity {
  checksum: string;
  payload: T;
}

export function canonicalEntity<T>(
  identity: SourceIdentity,
  payload: T,
): CanonicalEntity<T> {
  return { ...identity, payload, checksum: sourceChecksum(payload) };
}
