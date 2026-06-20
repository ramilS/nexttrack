import { describe, it, expect } from 'vitest';
import { isAdminRole } from './roles';

describe('isAdminRole', () => {
  it('returns true for the ADMIN role', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
  });

  it('returns false for the USER role', () => {
    expect(isAdminRole('USER')).toBe(false);
  });

  it('returns false for null or undefined', () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
