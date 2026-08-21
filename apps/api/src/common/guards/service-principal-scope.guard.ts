import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserKind } from '@prisma/client';
import { Permission } from '@repo/shared';
import { ErrorCode } from '@repo/shared/error-codes';
import { PERMISSION_KEY } from '@/common/decorators/require-permission.decorator';
import type { IntegrationRequest } from '@/common/http/integration-request';

/**
 * A key's rights come entirely from its service user's role, checked by
 * `PermissionGuard` — but `PermissionGuard` only runs on routes wired through
 * `@ProjectAuth()`/`@IssueAuth()`/`@BoardAuth()`. A route that requires no
 * permission (only authentication) never reaches it, so it stays reachable by
 * any valid key regardless of the key's role. This guard closes that gap:
 * a `SERVICE` principal on a route with no `@RequirePermission` metadata is
 * outside the contract a key exists to serve, so it is refused — fail closed,
 * so a future permission-less route is automatically closed to machines too.
 *
 * Reads `PERMISSION_KEY` the same way `PermissionGuard` does (handler then
 * class) so the two can never disagree about whether a route is gated.
 */
@Injectable()
export class ServicePrincipalScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IntegrationRequest>();

    if (req.user?.kind !== UserKind.SERVICE) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) return true;

    throw new ForbiddenException(ErrorCode.SERVICE_PRINCIPAL_ROUTE_NOT_ALLOWED);
  }
}
