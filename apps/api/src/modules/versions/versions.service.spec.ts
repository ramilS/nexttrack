import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { VersionsService } from "./versions.service";
import { VersionsRepository } from "./versions.repository";
import type { Version } from "@repo/shared/schemas";

describe("VersionsService", () => {
  let service: VersionsService;
  let repo: jest.Mocked<VersionsRepository>;

  const projectId = "project-1";

  const baseVersion: Version = {
    id: "version-1",
    projectId,
    name: "v1.0.0",
    description: "First release",
    status: "UNRELEASED",
    releaseDate: null,
    ordinal: 0,
  };

  beforeEach(async () => {
    const repoMock: jest.Mocked<VersionsRepository> = {
      findAllByProject: jest.fn(),
      findById: jest.fn(),
      maxOrdinal: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findIdsByProject: jest.fn(),
      updateOrdinalsAtomic: jest.fn(),
      countCustomFieldReferences: jest.fn(),
    } as unknown as jest.Mocked<VersionsRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionsService,
        { provide: VersionsRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get(VersionsService);
    repo = module.get(VersionsRepository);
  });

  describe("findAll", () => {
    it("should return all versions for a project", async () => {
      repo.findAllByProject.mockResolvedValue([
        baseVersion,
        { ...baseVersion, id: "version-2", name: "v2.0.0", ordinal: 1 },
      ]);

      const result = await service.findAll(projectId);

      expect(result).toHaveLength(2);
      expect(repo.findAllByProject).toHaveBeenCalledWith(projectId, undefined);
    });

    it("should filter by status when provided", async () => {
      repo.findAllByProject.mockResolvedValue([baseVersion]);

      await service.findAll(projectId, "UNRELEASED");

      expect(repo.findAllByProject).toHaveBeenCalledWith(
        projectId,
        "UNRELEASED",
      );
    });
  });

  describe("findOne", () => {
    it("should return a version by id and projectId", async () => {
      repo.findById.mockResolvedValue(baseVersion);

      const result = await service.findOne("version-1", projectId);

      expect(result.id).toBe("version-1");
      expect(repo.findById).toHaveBeenCalledWith("version-1", projectId);
    });

    it("should throw NotFoundError when version does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne("missing", projectId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("create", () => {
    it("should create a version with next ordinal", async () => {
      repo.maxOrdinal.mockResolvedValue(2);
      repo.create.mockResolvedValue({ ...baseVersion, ordinal: 3 });

      const result = await service.create(projectId, {
        name: "v1.0.0",
        description: "First release",
      });

      expect(result.ordinal).toBe(3);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, name: "v1.0.0", ordinal: 3 }),
      );
    });

    it("should start at ordinal 0 when no versions exist", async () => {
      repo.maxOrdinal.mockResolvedValue(-1);
      repo.create.mockResolvedValue(baseVersion);

      await service.create(projectId, { name: "v1.0.0" });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ordinal: 0 }),
      );
    });

    it("should default status to UNRELEASED when not provided", async () => {
      repo.maxOrdinal.mockResolvedValue(-1);
      repo.create.mockResolvedValue(baseVersion);

      await service.create(projectId, { name: "v1.0.0" });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "UNRELEASED" }),
      );
    });

    it("should pass status when provided", async () => {
      repo.maxOrdinal.mockResolvedValue(-1);
      repo.create.mockResolvedValue({ ...baseVersion, status: "RELEASED" });

      await service.create(projectId, { name: "v1.0.0", status: "RELEASED" });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "RELEASED" }),
      );
    });
  });

  describe("update", () => {
    it("should update version name", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.update.mockResolvedValue({ ...baseVersion, name: "v1.1.0" });

      const result = await service.update("version-1", projectId, {
        name: "v1.1.0",
      });

      expect(result.name).toBe("v1.1.0");
      expect(repo.update).toHaveBeenCalledWith("version-1", { name: "v1.1.0" });
    });

    it("should throw NotFoundError when version does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update("missing", projectId, { name: "x" }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("release", () => {
    it("should release version with provided date", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.update.mockResolvedValue({
        ...baseVersion,
        status: "RELEASED",
        releaseDate: "2026-06-01T00:00:00.000Z",
      });

      const result = await service.release(
        "version-1",
        projectId,
        "2026-06-01T00:00:00.000Z",
      );

      expect(result.status).toBe("RELEASED");
      expect(repo.update).toHaveBeenCalledWith("version-1", {
        status: "RELEASED",
        releaseDate: "2026-06-01T00:00:00.000Z",
      });
    });

    it("should release version with current date when no date provided", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.update.mockResolvedValue({ ...baseVersion, status: "RELEASED" });

      await service.release("version-1", projectId);

      expect(repo.update).toHaveBeenCalledWith(
        "version-1",
        expect.objectContaining({
          status: "RELEASED",
          releaseDate: expect.any(String),
        }),
      );
    });

    it("should throw NotFoundError when version does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.release("missing", projectId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("archive", () => {
    it("should archive version", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.update.mockResolvedValue({ ...baseVersion, status: "ARCHIVED" });

      const result = await service.archive("version-1", projectId);

      expect(result.status).toBe("ARCHIVED");
      expect(repo.update).toHaveBeenCalledWith("version-1", {
        status: "ARCHIVED",
      });
    });

    it("should throw NotFoundError when version does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.archive("missing", projectId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("remove", () => {
    it("should delete version when not in use", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.countCustomFieldReferences.mockResolvedValue(0);

      await service.remove("version-1", projectId);

      expect(repo.delete).toHaveBeenCalledWith("version-1");
    });

    it("should throw NotFoundError when version does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove("missing", projectId)).rejects.toThrow(
        NotFoundError,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should throw ConflictError when version is in use", async () => {
      repo.findById.mockResolvedValue(baseVersion);
      repo.countCustomFieldReferences.mockResolvedValue(3);

      await expect(service.remove("version-1", projectId)).rejects.toThrow(
        ConflictError,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe("reorder", () => {
    it("should reorder versions and return updated list", async () => {
      const ordinals = [
        { id: "version-1", ordinal: 1 },
        { id: "version-2", ordinal: 0 },
      ];
      repo.findIdsByProject.mockResolvedValue(["version-1", "version-2"]);
      repo.findAllByProject.mockResolvedValue([
        { ...baseVersion, id: "version-2", ordinal: 0 },
        { ...baseVersion, id: "version-1", ordinal: 1 },
      ]);

      const result = await service.reorder(projectId, { ordinals });

      expect(result).toHaveLength(2);
      expect(repo.updateOrdinalsAtomic).toHaveBeenCalledWith(ordinals);
    });

    it("should throw ValidationError when some IDs do not belong to project", async () => {
      repo.findIdsByProject.mockResolvedValue(["version-1"]);

      await expect(
        service.reorder(projectId, {
          ordinals: [
            { id: "version-1", ordinal: 0 },
            { id: "version-unknown", ordinal: 1 },
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
