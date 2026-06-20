import { Test } from "@nestjs/testing";
import { ConflictError, NotFoundError } from "@/common/errors/domain.errors";
import { TagsService } from "./tags.service";
import { TagsRepository } from "./tags.repository";
import { IssuesReader } from "@/modules/issues/issues.reader";
import { TransactionService } from "@/common/repository/transaction.service";
import { DomainEventPublisher } from "@/modules/outbox/domain-event-publisher";
import type { Tx } from "@/common/repository/tx.types";
import type { CreateTagInput, UpdateTagInput, Tag } from "@repo/shared/schemas";
import { ErrorCode } from "@repo/shared/error-codes";

describe("TagsService", () => {
  let service: TagsService;
  let tagsRepo: jest.Mocked<TagsRepository>;
  let issuesRepo: jest.Mocked<IssuesReader>;
  let domainEvents: { publish: jest.Mock };

  const projectId = "project-1";
  const userId = "user-1";

  const tagFixture: Tag = {
    id: "tag-1",
    projectId,
    name: "Bug",
    color: "#ff0000",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(async () => {
    const tagsRepoMock: jest.Mocked<TagsRepository> = {
      findAllByProject: jest.fn(),
      findById: jest.fn(),
      findByNameInsensitive: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      isLinkedToIssue: jest.fn(),
      linkToIssue: jest.fn(),
      unlinkFromIssue: jest.fn(),
    } as unknown as jest.Mocked<TagsRepository>;

    const issuesRepoMock: jest.Mocked<IssuesReader> = {
      findProjectIdById: jest.fn(),
    } as unknown as jest.Mocked<IssuesReader>;

    const txServiceMock = {
      run: jest.fn(async (work: (tx: Tx) => Promise<unknown>) => work({} as Tx)),
    };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: TagsRepository, useValue: tagsRepoMock },
        { provide: IssuesReader, useValue: issuesRepoMock },
        { provide: TransactionService, useValue: txServiceMock },
        { provide: DomainEventPublisher, useValue: domainEvents },
      ],
    }).compile();

    service = module.get(TagsService);
    tagsRepo = module.get(TagsRepository);
    issuesRepo = module.get(IssuesReader);
  });

  describe("findAll", () => {
    it("should return all tags for a project", async () => {
      tagsRepo.findAllByProject.mockResolvedValue([tagFixture]);

      const result = await service.findAll(projectId);

      expect(result).toEqual([tagFixture]);
      expect(tagsRepo.findAllByProject).toHaveBeenCalledWith(projectId);
    });

    it("should return an empty array when no tags exist", async () => {
      tagsRepo.findAllByProject.mockResolvedValue([]);

      const result = await service.findAll(projectId);

      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    const dto: CreateTagInput = { name: "Feature", color: "#00ff00" };

    it("should create a tag when name is unique within the project", async () => {
      tagsRepo.findByNameInsensitive.mockResolvedValue(null);
      tagsRepo.create.mockResolvedValue({ ...tagFixture, ...dto });

      const result = await service.create(projectId, dto);

      expect(tagsRepo.findByNameInsensitive).toHaveBeenCalledWith(
        projectId,
        dto.name,
      );
      expect(tagsRepo.create).toHaveBeenCalledWith({
        projectId,
        name: dto.name,
        color: dto.color,
      });
      expect(result.name).toBe(dto.name);
    });

    it("should throw ConflictError when tag name already exists", async () => {
      tagsRepo.findByNameInsensitive.mockResolvedValue(tagFixture);

      await expect(
        service.create(projectId, { name: "Bug", color: "#ff0000" }),
      ).rejects.toThrow(ConflictError);
    });

    it("should include TAG_NAME_TAKEN error code in conflict response", async () => {
      tagsRepo.findByNameInsensitive.mockResolvedValue(tagFixture);

      try {
        await service.create(projectId, { name: "Bug", color: "#ff0000" });
        fail("Expected ConflictError");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).code).toBe(ErrorCode.TAG_NAME_TAKEN);
      }
    });

    it("should not call create when a duplicate exists", async () => {
      tagsRepo.findByNameInsensitive.mockResolvedValue(tagFixture);

      await expect(service.create(projectId, dto)).rejects.toThrow();
      expect(tagsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    const tagId = "tag-1";

    it("should update a tag when it exists and name is not changing", async () => {
      const dto: UpdateTagInput = { color: "#0000ff" };
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.update.mockResolvedValue({ ...tagFixture, color: "#0000ff" });

      const result = await service.update(projectId, tagId, dto);

      expect(tagsRepo.findById).toHaveBeenCalledWith(tagId, projectId);
      expect(tagsRepo.update).toHaveBeenCalledWith(tagId, dto);
      expect(result.color).toBe("#0000ff");
    });

    it("should throw NotFoundError when tag does not exist", async () => {
      tagsRepo.findById.mockResolvedValue(null);

      await expect(
        service.update(projectId, tagId, { color: "#0000ff" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should check for duplicate name when dto.name is provided", async () => {
      const dto: UpdateTagInput = { name: "Feature" };
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.findByNameInsensitive.mockResolvedValue(null);
      tagsRepo.update.mockResolvedValue({ ...tagFixture, name: "Feature" });

      await service.update(projectId, tagId, dto);

      expect(tagsRepo.findByNameInsensitive).toHaveBeenCalledWith(
        projectId,
        "Feature",
        tagId,
      );
    });

    it("should throw ConflictError when updated name conflicts with another tag", async () => {
      const dto: UpdateTagInput = { name: "Existing" };
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.findByNameInsensitive.mockResolvedValue({
        ...tagFixture,
        id: "tag-2",
        name: "Existing",
      });

      await expect(service.update(projectId, tagId, dto)).rejects.toThrow(
        ConflictError,
      );
      expect(tagsRepo.update).not.toHaveBeenCalled();
    });

    it("should not check for duplicate name when dto.name is undefined", async () => {
      const dto: UpdateTagInput = { color: "#abcdef" };
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.update.mockResolvedValue({ ...tagFixture, ...dto });

      await service.update(projectId, tagId, dto);

      expect(tagsRepo.findByNameInsensitive).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    const tagId = "tag-1";

    it("should delete a tag when it exists", async () => {
      tagsRepo.findById.mockResolvedValue(tagFixture);

      await service.remove(projectId, tagId);

      expect(tagsRepo.findById).toHaveBeenCalledWith(tagId, projectId);
      expect(tagsRepo.delete).toHaveBeenCalledWith(tagId);
    });

    it("should throw NotFoundError when tag does not exist", async () => {
      tagsRepo.findById.mockResolvedValue(null);

      await expect(service.remove(projectId, tagId)).rejects.toThrow(
        NotFoundError,
      );
      expect(tagsRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe("addTagToIssue", () => {
    const issueId = "issue-1";
    const tagId = "tag-1";

    it("should create an issue-tag link and publish issue.tag-added", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.isLinkedToIssue.mockResolvedValue(false);

      await service.addTagToIssue(issueId, tagId, userId);

      expect(tagsRepo.linkToIssue).toHaveBeenCalledWith(
        issueId,
        tagId,
        expect.anything(),
      );
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "issue.tag-added",
          aggregateType: "Issue",
          aggregateId: issueId,
          payload: expect.objectContaining({
            issueId,
            projectId,
            userId,
            tagId,
            tagName: tagFixture.name,
          }),
        }),
        expect.anything(),
      );
    });

    it("should be a no-op when tag is already on the issue", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.isLinkedToIssue.mockResolvedValue(true);

      await service.addTagToIssue(issueId, tagId, userId);

      expect(tagsRepo.linkToIssue).not.toHaveBeenCalled();
      expect(domainEvents.publish).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when issue does not exist", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(null);

      await expect(service.addTagToIssue(issueId, tagId, userId)).rejects.toThrow(
        NotFoundError,
      );
      expect(tagsRepo.findById).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when tag does not exist", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue(null);

      await expect(service.addTagToIssue(issueId, tagId, userId)).rejects.toThrow(
        NotFoundError,
      );
      expect(tagsRepo.linkToIssue).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when tag belongs to different project", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue({
        ...tagFixture,
        projectId: "other-project",
      });

      await expect(service.addTagToIssue(issueId, tagId, userId)).rejects.toThrow(
        NotFoundError,
      );
      expect(tagsRepo.linkToIssue).not.toHaveBeenCalled();
    });
  });

  describe("removeTagFromIssue", () => {
    const issueId = "issue-1";
    const tagId = "tag-1";

    it("should delete the issue-tag link and publish issue.tag-removed", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.unlinkFromIssue.mockResolvedValue(true);

      await service.removeTagFromIssue(issueId, tagId, userId);

      expect(tagsRepo.unlinkFromIssue).toHaveBeenCalledWith(
        issueId,
        tagId,
        expect.anything(),
      );
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "issue.tag-removed",
          aggregateId: issueId,
          payload: expect.objectContaining({ tagId, tagName: tagFixture.name }),
        }),
        expect.anything(),
      );
    });

    it("should throw NotFoundError when link does not exist", async () => {
      issuesRepo.findProjectIdById.mockResolvedValue(projectId);
      tagsRepo.findById.mockResolvedValue(tagFixture);
      tagsRepo.unlinkFromIssue.mockResolvedValue(false);

      await expect(
        service.removeTagFromIssue(issueId, tagId, userId),
      ).rejects.toThrow(NotFoundError);
      expect(domainEvents.publish).not.toHaveBeenCalled();
    });
  });
});
