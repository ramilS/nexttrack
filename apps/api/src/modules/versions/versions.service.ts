import { Injectable } from "@nestjs/common";
import { AppLogger } from "@/common/logging/app-logger";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import type {
  CreateVersionInput,
  UpdateVersionInput,
  ReorderVersionsInput,
  Version,
  VersionStatus,
} from "@repo/shared/schemas";
import { VersionsRepository } from "./versions.repository";

@Injectable()
export class VersionsService {
  private readonly logger = new AppLogger(VersionsService.name);

  constructor(private versionsRepo: VersionsRepository) {}

  async findAll(projectId: string, status?: string): Promise<Version[]> {
    return this.versionsRepo.findAllByProject(
      projectId,
      status as VersionStatus | undefined,
    );
  }

  async findOne(versionId: string, projectId: string): Promise<Version> {
    const version = await this.versionsRepo.findById(versionId, projectId);
    if (!version) {
      throw new NotFoundError(ErrorCode.VERSION_NOT_FOUND);
    }
    return version;
  }

  async create(projectId: string, dto: CreateVersionInput): Promise<Version> {
    const maxOrdinal = await this.versionsRepo.maxOrdinal(projectId);
    const version = await this.versionsRepo.create({
      projectId,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? "UNRELEASED",
      releaseDate: dto.releaseDate ?? null,
      ordinal: maxOrdinal + 1,
    });
    this.logger.log('Version created', {
      versionId: version.id,
      projectId,
      status: dto.status ?? "UNRELEASED",
    });
    return version;
  }

  async update(
    versionId: string,
    projectId: string,
    dto: UpdateVersionInput,
  ): Promise<Version> {
    await this.assertExists(versionId, projectId);
    this.logger.log('Updating version', {
      versionId,
      projectId,
      fields: Object.keys(dto),
    });
    return this.versionsRepo.update(versionId, dto);
  }

  async release(
    versionId: string,
    projectId: string,
    releaseDate?: string,
  ): Promise<Version> {
    await this.assertExists(versionId, projectId);
    this.logger.log('Version released', { versionId, projectId });
    return this.versionsRepo.update(versionId, {
      status: "RELEASED",
      releaseDate: releaseDate ?? new Date().toISOString(),
    });
  }

  async archive(versionId: string, projectId: string): Promise<Version> {
    await this.assertExists(versionId, projectId);
    this.logger.log('Version archived', { versionId, projectId });
    return this.versionsRepo.update(versionId, { status: "ARCHIVED" });
  }

  async remove(versionId: string, projectId: string): Promise<void> {
    await this.assertExists(versionId, projectId);

    const usageCount = await this.versionsRepo.countCustomFieldReferences(
      projectId,
      versionId,
    );
    if (usageCount > 0) {
      throw new ConflictError(
        ErrorCode.VERSION_IN_USE,
        `Version is used in ${usageCount} issue(s)`,
        {
          affectedIssuesCount: usageCount,
        },
      );
    }

    await this.versionsRepo.delete(versionId);
    this.logger.log('Version deleted', { versionId, projectId });
  }

  async reorder(
    projectId: string,
    dto: ReorderVersionsInput,
  ): Promise<Version[]> {
    const versionIds = dto.ordinals.map((o) => o.id);
    const found = await this.versionsRepo.findIdsByProject(
      projectId,
      versionIds,
    );

    if (found.length !== versionIds.length) {
      throw new ValidationError(
        ErrorCode.VERSION_NOT_FOUND,
        "Some version IDs do not belong to this project",
      );
    }

    this.logger.log('Versions reordered', {
      projectId,
      versionIds,
    });
    await this.versionsRepo.updateOrdinalsAtomic(dto.ordinals);
    return this.findAll(projectId);
  }

  private async assertExists(
    versionId: string,
    projectId: string,
  ): Promise<void> {
    const version = await this.versionsRepo.findById(versionId, projectId);
    if (!version) {
      throw new NotFoundError(ErrorCode.VERSION_NOT_FOUND);
    }
  }
}
