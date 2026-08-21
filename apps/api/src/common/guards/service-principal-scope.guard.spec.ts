import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserKind } from '@prisma/client';
import { Permission } from '@repo/shared';
import { ErrorCode } from '@repo/shared/error-codes';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { createMockExecutionContext } from '@test/helpers';
import { ServicePrincipalScopeGuard } from './service-principal-scope.guard';

class UngatedClass {
  ungatedHandler() {}
}

class MixedClass {
  @RequirePermission(Permission.ISSUE_READ)
  gatedHandler() {}

  ungatedHandler() {}
}

@RequirePermission(Permission.ISSUE_READ)
class ClassLevelGatedClass {
  handler() {}
}

describe('ServicePrincipalScopeGuard', () => {
  let guard: ServicePrincipalScopeGuard;

  beforeEach(() => {
    // Real Reflector, real decorators — the guard's own read of metadata is
    // what's under test, not a stubbed return value.
    guard = new ServicePrincipalScopeGuard(new Reflector());
  });

  it('allows a request with no principal yet (e.g. a @Public() route)', () => {
    const context = createMockExecutionContext({
      handler: UngatedClass.prototype.ungatedHandler,
      classRef: UngatedClass,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a HUMAN principal on a route with no @RequirePermission', () => {
    const context = createMockExecutionContext({
      user: { kind: UserKind.HUMAN },
      handler: UngatedClass.prototype.ungatedHandler,
      classRef: UngatedClass,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses a SERVICE principal on a route with no @RequirePermission anywhere', () => {
    const context = createMockExecutionContext({
      user: { kind: UserKind.SERVICE },
      handler: UngatedClass.prototype.ungatedHandler,
      classRef: UngatedClass,
    });

    let caught: unknown;
    try {
      guard.canActivate(context);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    // NestJS wraps a string ctor arg into `{ statusCode, message, error }`; the
    // ErrorCode always surfaces as `.message`, which is what AllExceptionsFilter
    // reads to build the client-facing `error.code` (see api-key-auth.service.spec.ts).
    expect((caught as ForbiddenException).message).toBe(
      ErrorCode.SERVICE_PRINCIPAL_ROUTE_NOT_ALLOWED,
    );
  });

  it('allows a SERVICE principal when the handler itself declares @RequirePermission', () => {
    const context = createMockExecutionContext({
      user: { kind: UserKind.SERVICE },
      handler: MixedClass.prototype.gatedHandler,
      classRef: MixedClass,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses a SERVICE principal on a sibling handler that declares no permission of its own', () => {
    const context = createMockExecutionContext({
      user: { kind: UserKind.SERVICE },
      handler: MixedClass.prototype.ungatedHandler,
      classRef: MixedClass,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a SERVICE principal when only the class declares @RequirePermission', () => {
    const context = createMockExecutionContext({
      user: { kind: UserKind.SERVICE },
      handler: ClassLevelGatedClass.prototype.handler,
      classRef: ClassLevelGatedClass,
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
