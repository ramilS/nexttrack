import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@repo/shared';
import { getMembershipRoleUpdateErrorMessage } from './use-users';

describe('getMembershipRoleUpdateErrorMessage', () => {
  it('explains that another Project Admin is needed when a stale role update is rejected', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: { error: { code: ErrorCode.CANNOT_REMOVE_LAST_OWNER } },
      },
    };

    expect(getMembershipRoleUpdateErrorMessage(error)).toBe(
      'Assign another Project Admin before changing this role.',
    );
  });
});
