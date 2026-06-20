import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type { PaginatedResponse } from '@repo/shared';
import type {
  CreateProjectParsed,
  UpdateProjectInput,
  ListProjectsQueryParsed,
  Project,
  ProjectDetail,
} from '@repo/shared/schemas';
import {
  ProjectsRepository,
  ProjectEntity,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  private readonly logger = new AppLogger(ProjectsService.name);

  constructor(private projectsRepo: ProjectsRepository) {}

  async create(
    dto: CreateProjectParsed,
    userId: string,
  ): Promise<ProjectDetail> {
    if (await this.projectsRepo.existsByKey(dto.key)) {
      throw new ConflictError(
        ErrorCode.PROJECT_KEY_TAKEN,
        `Project key "${dto.key}" is already taken`,
      );
    }

    const project = await this.projectsRepo.createWithDefaults({
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? null,
      iconUrl: dto.iconUrl ?? null,
      isPrivate: dto.isPrivate ?? false,
      createdById: userId,
    });
    this.logger.log('Project created', {
      projectId: project.id,
      key: project.key,
      isPrivate: dto.isPrivate ?? false,
    });
    return project;
  }

  async findAll(
    dto: ListProjectsQueryParsed,
    userId: string,
    isAdmin: boolean,
  ): Promise<PaginatedResponse<Project>> {
    return this.projectsRepo.findPage({
      page: dto.page,
      perPage: dto.perPage,
      search: dto.search,
      isArchived: dto.isArchived,
      myOnly: dto.myOnly,
      userId,
      isAdmin,
    });
  }

  async findByKey(key: string, userId: string): Promise<ProjectDetail> {
    const detail = await this.projectsRepo.findDetailByKey(key, userId);
    if (!detail) {
      throw new NotFoundError(ErrorCode.PROJECT_NOT_FOUND);
    }
    return detail;
  }

  async update(
    project: ProjectEntity,
    dto: UpdateProjectInput,
    userId: string,
  ): Promise<ProjectDetail> {
    this.logger.log('Updating project', {
      projectId: project.id,
      fields: Object.keys(dto),
    });
    await this.projectsRepo.update(project.id, dto);
    return this.findByKey(project.key, userId);
  }

  async archive(project: ProjectEntity, userId: string): Promise<ProjectDetail> {
    this.logger.log('Archiving project', { projectId: project.id });
    await this.projectsRepo.setArchive(project.id, new Date(), userId);
    return this.findByKey(project.key, userId);
  }

  async unarchive(project: ProjectEntity, userId: string): Promise<ProjectDetail> {
    this.logger.log('Unarchiving project', { projectId: project.id });
    await this.projectsRepo.setArchive(project.id, null, null);
    return this.findByKey(project.key, userId);
  }

  async softDelete(project: ProjectEntity, userId: string): Promise<void> {
    const resolvedStatusIds = await this.projectsRepo.findResolvedStatusIds(project.id);
    const openIssuesCount = await this.projectsRepo.countOpenIssues(
      project.id,
      resolvedStatusIds,
    );

    if (openIssuesCount > 0) {
      throw new ConflictError(
        ErrorCode.PROJECT_HAS_OPEN_ISSUES,
        `Cannot delete project with ${openIssuesCount} open issues`,
        { openIssuesCount },
      );
    }

    await this.projectsRepo.softDeleteCascade(project.id, userId);
    this.logger.log('Project soft-deleted', {
      projectId: project.id,
      key: project.key,
    });
  }

  async restore(projectKey: string, userId: string): Promise<ProjectDetail> {
    const project = await this.projectsRepo.findEntityByKey(projectKey, {
      mustBeDeleted: true,
    });
    if (!project) {
      throw new NotFoundError(ErrorCode.PROJECT_NOT_FOUND);
    }

    await this.projectsRepo.setDelete(project.id, null, null);
    this.logger.log('Project restored', { projectId: project.id });
    return this.findByKey(project.key, userId);
  }

  assertNotArchived(project: ProjectEntity): void {
    if (project.archivedAt) {
      throw new PermissionDeniedError(
        ErrorCode.PROJECT_ARCHIVED,
        'Project is archived',
      );
    }
  }
}
