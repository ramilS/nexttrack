import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { Permission } from '@repo/shared';
import { PERMISSION_KEY } from '@/common/decorators/require-permission.decorator';
import { ErrorCode } from '@repo/shared/error-codes';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectsRepo: ProjectsRepository,
    private membersRepo: ProjectMembersRepository,
    private permissionsCache: PermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const req = context.switchToHttp().getRequest();

    if (req.user.role === GlobalRole.ADMIN) return true;

    if (!req.project && req.params.key) {
      const project = await this.projectsRepo.findEntityByKey(req.params.key);
      if (!project) {
        throw new NotFoundException(ErrorCode.PROJECT_NOT_FOUND);
      }
      req.project = project;
    }

    const project = req.project;
    if (!project) {
      throw new ForbiddenException(ErrorCode.NOT_PROJECT_MEMBER);
    }

    const member = await this.permissionsCache.getMembership(
      req.user.id,
      project.id,
      () =>
        this.membersRepo.findMembershipWithPermissions(req.user.id, project.id),
    );

    if (!member) {
      throw new ForbiddenException(ErrorCode.NOT_PROJECT_MEMBER);
    }

    const hasAll = requiredPermissions.every((p) =>
      member.permissions.includes(p),
    );

    if (!hasAll) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    req.projectMember = member;
    req.memberPermissions = member.permissions;
    return true;
  }
}
