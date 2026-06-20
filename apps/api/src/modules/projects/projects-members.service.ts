import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  AddMemberInput,
  UpdateMemberInput,
  ProjectMember,
  UserSummary,
} from '@repo/shared/schemas';
import {
  ProjectMembersRepository,
  MemberListQuery,
} from './project-members.repository';
import { ProjectEntity } from './projects.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

const PROJECT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class ProjectsMembersService {
  constructor(
    private membersRepo: ProjectMembersRepository,
    private rolesRepo: RolesRepository,
    private usersRepo: UsersReader,
    private permissionsCache: PermissionsCacheService,
  ) {}

  findAll(
    project: ProjectEntity,
    query?: { search?: string; role?: string },
  ): Promise<ProjectMember[]> {
    const repoQuery: MemberListQuery = {};
    if (query?.search) repoQuery.search = query.search;
    if (query?.role) repoQuery.roleId = query.role;
    return this.membersRepo.findAll(project.id, repoQuery);
  }

  async addMember(
    project: ProjectEntity,
    dto: AddMemberInput,
    invitedBy: string,
  ): Promise<ProjectMember> {
    const userExists = await this.usersRepo.existsActiveById(dto.userId);
    if (!userExists) {
      throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    }

    const role = await this.rolesRepo.findById(dto.roleId);
    if (!role) {
      throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND);
    }

    if (await this.membersRepo.isMember(dto.userId, project.id)) {
      throw new ConflictError(
        ErrorCode.ALREADY_PROJECT_MEMBER,
        'User is already a member of this project',
      );
    }

    const created = await this.membersRepo.create({
      userId: dto.userId,
      projectId: project.id,
      roleId: dto.roleId,
      invitedBy,
    });
    await this.permissionsCache.invalidateAll();
    return created;
  }

  async updateRole(
    project: ProjectEntity,
    userId: string,
    dto: UpdateMemberInput,
  ): Promise<ProjectMember> {
    const member = await this.membersRepo.findOne(userId, project.id);
    if (!member) {
      throw new NotFoundError(ErrorCode.NOT_PROJECT_MEMBER);
    }

    const newRole = await this.rolesRepo.findById(dto.roleId);
    if (!newRole) {
      throw new NotFoundError(ErrorCode.ROLE_NOT_FOUND);
    }

    if (
      member.roleId === PROJECT_ADMIN_ROLE_ID &&
      dto.roleId !== PROJECT_ADMIN_ROLE_ID
    ) {
      await this.assertNotLastAdmin(project.id);
    }

    const updated = await this.membersRepo.updateRole(
      userId,
      project.id,
      dto.roleId,
    );
    await this.permissionsCache.invalidateAll();
    return updated;
  }

  async removeMember(project: ProjectEntity, userId: string): Promise<void> {
    const member = await this.membersRepo.findOne(userId, project.id);
    if (!member) {
      throw new NotFoundError(ErrorCode.NOT_PROJECT_MEMBER);
    }

    if (member.roleId === PROJECT_ADMIN_ROLE_ID) {
      await this.assertNotLastAdmin(project.id);
    }

    await this.membersRepo.removeWithCleanup(userId, project.id);
    await this.permissionsCache.invalidateAll();
  }

  searchMembers(project: ProjectEntity, query: string): Promise<UserSummary[]> {
    return this.membersRepo.searchMembers(project.id, query);
  }

  searchAddableUsers(project: ProjectEntity, query: string): Promise<UserSummary[]> {
    return this.membersRepo.searchAddableUsers(project.id, query);
  }

  private async assertNotLastAdmin(projectId: string): Promise<void> {
    const adminCount = await this.membersRepo.countByRole(projectId, PROJECT_ADMIN_ROLE_ID);
    if (adminCount <= 1) {
      throw new ValidationError(
        ErrorCode.CANNOT_REMOVE_LAST_OWNER,
        'Cannot remove or demote the last admin of a project',
      );
    }
  }
}
