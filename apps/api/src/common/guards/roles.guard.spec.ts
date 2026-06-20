import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { createMockExecutionContext } from '@test/helpers';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockExecutionContext({ user: { role: GlobalRole.USER } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([GlobalRole.ADMIN]);

    const context = createMockExecutionContext({ user: { role: GlobalRole.ADMIN } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([GlobalRole.ADMIN]);

    const context = createMockExecutionContext({ user: { role: GlobalRole.USER } });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow when user has any of multiple required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([GlobalRole.ADMIN, GlobalRole.USER]);

    const context = createMockExecutionContext({ user: { role: GlobalRole.USER } });

    expect(guard.canActivate(context)).toBe(true);
  });
});
