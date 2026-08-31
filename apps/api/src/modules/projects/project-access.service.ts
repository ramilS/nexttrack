import { Injectable } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { UsersReader } from '@/modules/users/users.reader';
import { ProjectsRepository } from './projects.repository';
import { ProjectMembersRepository } from './project-members.repository';

/**
 * The single answer to "which projects may this user read?" for endpoints that
 * span more than one project (cross-project search, the board switcher).
 *
 * Visibility is membership: an admin reaches every active project, anyone else
 * reaches the projects they are a member of. Endpoints scoped to ONE project
 * must keep using `@ProjectAuth` + `@RequirePermission` — this service answers
 * a coarser question and is not a substitute for a permission check.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    private usersRepo: UsersReader,
    private projectsRepo: ProjectsRepository,
    private membersRepo: ProjectMembersRepository,
  ) {}

  async findAccessibleProjectIds(
    userId: string,
    restrictToProjectId?: string,
  ): Promise<string[]> {
    const role = await this.usersRepo.findRoleById(userId);

    if (role === GlobalRole.ADMIN) {
      if (restrictToProjectId) return [restrictToProjectId];
      return this.projectsRepo.findAllActiveIds();
    }

    return this.membersRepo.findProjectIdsForUser(userId, restrictToProjectId);
  }
}
