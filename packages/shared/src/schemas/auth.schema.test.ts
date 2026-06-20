import { describe, it, expect } from 'vitest';
import { loginSchema, acceptInviteSchema } from './auth.schema';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('loginSchema', () => {
  it('normalizes the email (trim + lowercase)', () => {
    const r = loginSchema.safeParse({ email: '  USER@X.COM ', password: 'secret12' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@x.com');
  });

  it('rejects a too-short password', () => {
    expect(loginSchema.safeParse({ email: 'u@x.com', password: 'short' }).success).toBe(
      false,
    );
  });
});

describe('acceptInviteSchema', () => {
  it('accepts a valid invite payload', () => {
    expect(
      acceptInviteSchema.safeParse({ token: UUID, name: 'Jane', password: 'Abcdef12' })
        .success,
    ).toBe(true);
  });

  it('enforces password complexity (needs upper/lower/digit)', () => {
    expect(
      acceptInviteSchema.safeParse({ token: UUID, name: 'Jane', password: 'alllowercase' })
        .success,
    ).toBe(false);
  });

  it('rejects a non-uuid token', () => {
    expect(
      acceptInviteSchema.safeParse({ token: 'nope', name: 'Jane', password: 'Abcdef12' })
        .success,
    ).toBe(false);
  });
});
