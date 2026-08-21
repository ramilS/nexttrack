import { Permission } from '@repo/shared';
import { INTEGRATION_ROLE, INTEGRATION_ROLE_ID } from './integration-role';

describe('INTEGRATION_ROLE', () => {
  it('uses the reserved system-role id', () => {
    expect(INTEGRATION_ROLE_ID).toBe('00000000-0000-0000-0000-000000000006');
    expect(INTEGRATION_ROLE.id).toBe(INTEGRATION_ROLE_ID);
  });

  it('grants exactly read, create and comment — nothing that can edit an issue', () => {
    expect(new Set(INTEGRATION_ROLE.permissions)).toEqual(
      new Set([Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE]),
    );
  });

  it('is a system role so it cannot be edited or deleted from the UI', () => {
    expect(INTEGRATION_ROLE.isSystem).toBe(true);
  });
});
