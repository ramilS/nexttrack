import { describe, it, expect } from 'vitest';
import { passwordSchema, sendInviteSchema, changePasswordSchema } from './user.schema';

describe('passwordSchema', () => {
  it('accepts a password with upper, lower, and a digit', () => {
    expect(passwordSchema.safeParse('Password1').success).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(passwordSchema.safeParse('Pass1').success).toBe(false);
  });

  it('rejects passwords missing a required character class', () => {
    expect(passwordSchema.safeParse('alllowercase1').success).toBe(false); // no uppercase
    expect(passwordSchema.safeParse('NoDigitsHere').success).toBe(false); // no digit
  });

  it('rejects passwords over the max length', () => {
    expect(passwordSchema.safeParse('Aa1' + 'x'.repeat(200)).success).toBe(false);
  });
});

describe('sendInviteSchema email normalization', () => {
  it('lowercases and trims the email', () => {
    const result = sendInviteSchema.safeParse({ email: '  USER@Example.COM  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects an invalid email', () => {
    expect(sendInviteSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('requires a valid new password', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'whatever', newPassword: 'weak' })
        .success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'whatever',
        newPassword: 'Password1',
      }).success,
    ).toBe(true);
  });
});
