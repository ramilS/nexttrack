import { SYSTEM_ROLE_IDS, SYSTEM_ROLES, type SystemRoleDefinition } from '@repo/shared';

export const INTEGRATION_ROLE_ID = SYSTEM_ROLE_IDS.INTEGRATION;

function resolveIntegrationRole(): SystemRoleDefinition {
  const role = SYSTEM_ROLES.find((r) => r.id === INTEGRATION_ROLE_ID);
  if (!role) {
    throw new Error(
      `SYSTEM_ROLES is missing the reserved Integration role (${INTEGRATION_ROLE_ID})`,
    );
  }
  return role;
}

/**
 * The seeded role every API-key service principal is given. Resolved from the
 * shared system-role definitions rather than restated here, so the role this
 * module hands out and the role the seed / test harness creates cannot drift.
 * `integration-role.spec.ts` guards the permission set itself.
 */
export const INTEGRATION_ROLE = resolveIntegrationRole();
