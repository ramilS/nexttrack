import { describe, it, expect } from 'vitest';
import { mapYtRole } from './team.extractor';

describe('mapYtRole', () => {
  it('maps known YouTrack role names to NextTrack role names (case-insensitive)', () => {
    expect(mapYtRole('Developer')).toBe('Developer');
    expect(mapYtRole('project admin')).toBe('Project Admin');
    expect(mapYtRole('ADMINISTRATOR')).toBe('Project Admin');
    expect(mapYtRole('Observer')).toBe('Observer');
  });

  it('returns undefined for unknown or empty roles (caller falls back to default)', () => {
    expect(mapYtRole('Wizard')).toBeUndefined();
    expect(mapYtRole(undefined)).toBeUndefined();
    expect(mapYtRole('')).toBeUndefined();
  });
});
