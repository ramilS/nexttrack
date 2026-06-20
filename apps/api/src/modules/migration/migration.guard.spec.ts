import { ForbiddenException } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { MigrationGuard } from './migration.guard';
import { createMockExecutionContext } from '@test/helpers';

const SECRET = 'a'.repeat(32);

function buildGuard(apiSecret: string | undefined): MigrationGuard {
  return new MigrationGuard({
    apiSecret,
    allowBackdatedRecords: false,
  });
}

describe('MigrationGuard', () => {
  it('allows an admin presenting the correct secret', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': SECRET },
      user: { role: GlobalRole.ADMIN },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when the secret is not configured (deny by default)', () => {
    const guard = buildGuard(undefined);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': SECRET },
      user: { role: GlobalRole.ADMIN },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a wrong secret', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': 'b'.repeat(32) },
      user: { role: GlobalRole.ADMIN },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a correct-prefix secret of different length (no partial match)', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': 'a'.repeat(31) },
      user: { role: GlobalRole.ADMIN },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a missing secret header', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: {},
      user: { role: GlobalRole.ADMIN },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a header sent as an array (not a single string)', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': [SECRET, SECRET] },
      user: { role: GlobalRole.ADMIN },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a valid secret when the user is not an admin', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': SECRET },
      user: { role: GlobalRole.USER },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a valid secret when there is no authenticated user', () => {
    const guard = buildGuard(SECRET);
    const ctx = createMockExecutionContext({
      headers: { 'x-migration-secret': SECRET },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
