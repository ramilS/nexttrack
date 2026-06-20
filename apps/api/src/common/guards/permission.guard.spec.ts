import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { Permission } from '@repo/shared';
import {
  createMockExecutionContext,
  buildProject,
  buildRole,
  buildProjectAdminRole,
} from '@test/helpers';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;
  let projectsRepo: { findEntityByKey: jest.Mock };
  let membersRepo: { findMembershipWithPermissions: jest.Mock };

  beforeEach(async () => {
    projectsRepo = { findEntityByKey: jest.fn() };
    membersRepo = { findMembershipWithPermissions: jest.fn() };

    const passthroughCache = {
      getMembership: jest.fn(
        (_u: string, _p: string, loader: () => Promise<unknown>) => loader(),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        Reflector,
        { provide: ProjectsRepository, useValue: projectsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: PermissionsCacheService, useValue: passthroughCache },
      ],
    }).compile();

    guard = module.get(PermissionGuard);
    reflector = module.get(Reflector);
  });

  const memberWithPermissions = (
    userId: string,
    projectId: string,
    permissions: string[],
  ) => ({
    userId,
    projectId,
    roleId: 'role-1',
    permissions,
  });

  it('should allow access when no permissions required', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockExecutionContext({ user: { role: 'USER' } });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should allow ADMIN to bypass permission check', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);

    const context = createMockExecutionContext({
      user: { id: 'admin-1', role: 'ADMIN' },
      project: buildProject(),
    });

    expect(await guard.canActivate(context)).toBe(true);
    expect(membersRepo.findMembershipWithPermissions).not.toHaveBeenCalled();
  });

  it('should throw if no project on request and no key param', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should load project from key param when not on request', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);

    const project = buildProject({ key: 'MOB' });
    projectsRepo.findEntityByKey.mockResolvedValue(project);

    const role = buildRole({
      permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE],
    });
    membersRepo.findMembershipWithPermissions.mockResolvedValue(
      memberWithPermissions('user-1', project.id, role.permissions),
    );

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      params: { key: 'MOB' },
    });

    expect(await guard.canActivate(context)).toBe(true);
    expect(projectsRepo.findEntityByKey).toHaveBeenCalledWith('MOB');
  });

  it('should throw NotFoundException when key param refers to unknown project', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);
    projectsRepo.findEntityByKey.mockResolvedValue(null);

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      params: { key: 'UNKNOWN' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw if user is not a project member', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);
    membersRepo.findMembershipWithPermissions.mockResolvedValue(null);

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      project: buildProject(),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow when member has all required permissions', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ, Permission.ISSUE_CREATE]);

    const project = buildProject();
    membersRepo.findMembershipWithPermissions.mockResolvedValue(
      memberWithPermissions('user-1', project.id, [
        Permission.ISSUE_READ,
        Permission.ISSUE_CREATE,
        Permission.ISSUE_UPDATE,
      ]),
    );

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      project,
    });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw when member lacks a required permission', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ, Permission.ISSUE_DELETE]);

    membersRepo.findMembershipWithPermissions.mockResolvedValue(
      memberWithPermissions('user-1', 'p1', [
        Permission.ISSUE_READ,
        Permission.ISSUE_CREATE,
      ]),
    );

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      project: buildProject(),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow Project Admin (all permissions) for any required permission', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.WEBHOOK_MANAGE]);

    const role = buildProjectAdminRole();
    membersRepo.findMembershipWithPermissions.mockResolvedValue(
      memberWithPermissions('user-1', 'p1', role.permissions),
    );

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      project: buildProject(),
    });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should set projectMember and memberPermissions on request', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.ISSUE_READ]);

    const project = buildProject();
    const member = memberWithPermissions('user-1', project.id, [
      Permission.ISSUE_READ,
    ]);
    membersRepo.findMembershipWithPermissions.mockResolvedValue(member);

    const context = createMockExecutionContext({
      user: { id: 'user-1', role: 'USER' },
      project,
    });

    await guard.canActivate(context);

    const req = context.switchToHttp().getRequest();
    expect(req.projectMember).toEqual(member);
    expect(req.memberPermissions).toEqual([Permission.ISSUE_READ]);
  });
});
