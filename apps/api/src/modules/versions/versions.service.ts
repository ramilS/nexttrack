import { Injectable } from "@nestjs/common";
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
    return this.versionsRepo.create({
      projectId,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? "UNRELEASED",
      releaseDate: dto.releaseDate ?? null,
      ordinal: maxOrdinal + 1,
    });
  }

  async update(
    versionId: string,
    projectId: string,
    dto: UpdateVersionInput,
  ): Promise<Version> {
    await this.assertExists(versionId, projectId);
    return this.versionsRepo.update(versionId, dto);
  }

  async release(
    versionId: string,
    projectId: string,
    releaseDate?: string,
  ): Promise<Version> {
    await this.assertExists(versionId, projectId);
    return this.versionsRepo.update(versionId, {
      status: "RELEASED",
      releaseDate: releaseDate ?? new Date().toISOString(),
    });
  }

  async archive(versionId: string, projectId: string): Promise<Version> {
    await this.assertExists(versionId, projectId);
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
