import { Injectable } from "@nestjs/common";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import type {
  CreateTeamInput,
  UpdateTeamInput,
  AddTeamMembersInput,
  Team,
} from "@repo/shared/schemas";
import { TeamsRepository } from "./teams.repository";
import { ProjectMembersRepository } from "@/modules/projects/project-members.repository";

@Injectable()
export class TeamsService {
  constructor(
    private teamsRepo: TeamsRepository,
    private membersRepo: ProjectMembersRepository,
  ) {}

  async findAll(projectId: string): Promise<Team[]> {
    return this.teamsRepo.findAll(projectId);
  }

  async findOne(projectId: string, teamId: string): Promise<Team> {
    const team = await this.teamsRepo.findOne(projectId, teamId);
    if (!team) throw this.teamNotFound();
    return team;
  }

  async create(projectId: string, dto: CreateTeamInput): Promise<Team> {
    await this.assertNameUnique(projectId, dto.name);

    if (dto.leadId) {
      await this.assertProjectMember(projectId, dto.leadId);
    }

    return this.teamsRepo.create({
      projectId,
      name: dto.name,
      description: dto.description ?? null,
      leadId: dto.leadId ?? null,
    });
  }

  async update(
    projectId: string,
    teamId: string,
    dto: UpdateTeamInput,
  ): Promise<Team> {
    const currentName = await this.teamsRepo.findCurrentName(projectId, teamId);
    if (!currentName) throw this.teamNotFound();

    if (dto.name && dto.name !== currentName) {
      await this.assertNameUnique(projectId, dto.name, teamId);
    }

    if (dto.leadId) {
      await this.assertProjectMember(projectId, dto.leadId);
    }

    return this.teamsRepo.update(teamId, {
      name: dto.name,
      description: dto.description,
      leadId: dto.leadId,
    });
  }

  async remove(projectId: string, teamId: string): Promise<void> {
    if (!(await this.teamsRepo.existsInProject(projectId, teamId))) {
      throw this.teamNotFound();
    }
    await this.teamsRepo.delete(teamId);
  }

  async addMembers(
    projectId: string,
    teamId: string,
    dto: AddTeamMembersInput,
  ): Promise<Team> {
    if (!(await this.teamsRepo.existsInProject(projectId, teamId))) {
      throw this.teamNotFound();
    }

    const projectMemberIds = await this.membersRepo.filterMembersByUserIds(
      projectId,
      dto.userIds,
    );
    const validSet = new Set(projectMemberIds);
    const invalidIds = dto.userIds.filter((id) => !validSet.has(id));

    if (invalidIds.length > 0) {
      throw new ValidationError(
        ErrorCode.NOT_PROJECT_MEMBER,
        `Users are not project members: ${invalidIds.join(", ")}`,
      );
    }

    const existingIds = new Set(
      await this.teamsRepo.findExistingMemberIds(teamId, dto.userIds),
    );
    const newUserIds = dto.userIds.filter((id) => !existingIds.has(id));

    await this.teamsRepo.addMembers(teamId, newUserIds);
    return this.findOne(projectId, teamId);
  }

  async removeMember(
    projectId: string,
    teamId: string,
    userId: string,
  ): Promise<void> {
    if (!(await this.teamsRepo.existsInProject(projectId, teamId))) {
      throw this.teamNotFound();
    }

    const member = await this.teamsRepo.findMember(teamId, userId);
    if (!member) {
      throw new NotFoundError(
        ErrorCode.TEAM_MEMBER_NOT_FOUND,
        "User is not a member of this team",
      );
    }

    await this.teamsRepo.removeMember(teamId, userId);
  }

  // ─── Private helpers ───────────────────────────────────────

  private async assertNameUnique(
    projectId: string,
    name: string,
    excludeId?: string,
  ) {
    const taken = await this.teamsRepo.findNameInProject(
      projectId,
      name,
      excludeId,
    );
    if (taken) {
      throw new ConflictError(
        ErrorCode.TEAM_NAME_TAKEN,
        `Team "${name}" already exists in this project`,
      );
    }
  }

  private async assertProjectMember(projectId: string, userId: string) {
    if (!(await this.membersRepo.isMember(userId, projectId))) {
      throw new ValidationError(
        ErrorCode.TEAM_LEAD_NOT_MEMBER,
        "Team lead must be a project member",
      );
    }
  }

  private teamNotFound(): NotFoundError {
    return new NotFoundError(ErrorCode.TEAM_NOT_FOUND, "Team not found");
  }
}
