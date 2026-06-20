import { describe, it, expect } from 'vitest';
import {
  notificationQuerySchema,
  updatePreferencesSchema,
} from './notification.schema';

describe('notificationQuerySchema', () => {
  it('coerces pageSize, parses isRead from string, applies default', () => {
    const r = notificationQuerySchema.safeParse({ pageSize: '15', isRead: 'true' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pageSize).toBe(15);
      expect(r.data.isRead).toBe(true);
    }
  });

  it('defaults pageSize to 20 and leaves isRead undefined when absent', () => {
    const r = notificationQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pageSize).toBe(20);
      expect(r.data.isRead).toBeUndefined();
    }
  });
});

describe('updatePreferencesSchema', () => {
  it('accepts a valid emailMode and channel toggles', () => {
    const r = updatePreferencesSchema.safeParse({
      emailMode: 'DIGEST',
      channelSettings: { ISSUE_ASSIGNED: { inApp: true, email: false } },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown emailMode', () => {
    expect(
      updatePreferencesSchema.safeParse({ emailMode: 'WEEKLY' }).success,
    ).toBe(false);
  });

  it('rejects a channel toggle missing a required boolean', () => {
    expect(
      updatePreferencesSchema.safeParse({
        channelSettings: { ISSUE_ASSIGNED: { inApp: true } },
      }).success,
    ).toBe(false);
  });
});
