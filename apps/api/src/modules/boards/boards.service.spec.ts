import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundError, ValidationError } from "@/common/errors/domain.errors";
import { BoardType, SwimlaneBy } from "@prisma/client";
import { BoardsService } from "./boards.service";
import { BoardsRepository, BoardEntity } from "./boards.repository";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectEntity } from "@/modules/projects/projects.repository";
import type { Workflow } from "@repo/shared/schemas";

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe("BoardsService", () => {
  let service: BoardsService;
  let boardsRepo: Mocked<BoardsRepository>;
  let workflowsRepo: Mocked<WorkflowsReader>;

  const projectId = "proj-1";
  const boardId = "board-1";
  const userId = "user-1";

  const buildBoard = (overrides?: Partial<BoardEntity>): BoardEntity => ({
    id: boardId,
    projectId,
    name: "Default Board",
    type: BoardType.KANBAN,
    columns: [
      {
        id: "col-1",
        name: "To Do",
        statusIds: ["s1"],
        ordinal: 0,
      },
      {
        id: "col-2",
        name: "In Progress",
        statusIds: ["s2"],
        ordinal: 1,
      },
      {
        id: "col-3",
        name: "Done",
        statusIds: ["s3"],
        ordinal: 2,
      },
    ],
    swimlaneBy: SwimlaneBy.NONE,
    filterQuery: null,
    autoCloseOnDone: true,
    isDefault: true,
    createdById: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const project: ProjectEntity = {
    id: projectId,
    key: "PROJ",
    name: "Project",
    description: null,
    color: null,
    iconUrl: null,
    isPrivate: false,
    archivedAt: null,
    archivedById: null,
    deletedAt: null,
    deletedById: null,
    createdById: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const workflow: Workflow = {
    id: "wf-1",
    projectId,
    name: "Default",
    isDefault: true,
    statuses: [
      {
        id: "s1",
        name: "Open",
        color: "#6b7280",
        category: "UNSTARTED",
        isInitial: true,
        isResolved: false,
        ordinal: 0,
      },
      {
        id: "s2",
        name: "In Progress",
        color: "#3b82f6",
        category: "STARTED",
        isInitial: false,
        isResolved: false,
        ordinal: 1,
      },
      {
        id: "s3",
        name: "Done",
        color: "#22c55e",
        category: "DONE",
        isInitial: false,
        isResolved: true,
        ordinal: 2,
      },
    ],
    transitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    boardsRepo = {
      findAllByProject: jest.fn(),
      findEntityInProject: jest.fn(),
      countByProject: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateColumns: jest.fn(),
      setIsDefault: jest.fn().mockResolvedValue(undefined),
      setDefaultAtomic: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<BoardsRepository>;

    workflowsRepo = {
      findDefault: jest.fn().mockResolvedValue(workflow),
    } as unknown as Mocked<WorkflowsReader>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardsService,
        { provide: BoardsRepository, useValue: boardsRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
      ],
    }).compile();

    service = module.get(BoardsService);
  });

  describe("findOne", () => {
    it("returns the board when found", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      const result = await service.findOne(projectId, boardId);
      expect(result.name).toBe("Default Board");
    });

    it("throws NotFoundError when missing", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(null);
      await expect(service.findOne(projectId, boardId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("create", () => {
    it("creates a board with default columns derived from the workflow", async () => {
      boardsRepo.create.mockResolvedValue(buildBoard({ isDefault: false }));
      boardsRepo.countByProject.mockResolvedValue(2);

      await service.create(project, { name: "New" } as never, userId);

      expect(boardsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          name: "New",
          isDefault: false,
        }),
      );
      expect(boardsRepo.setIsDefault).not.toHaveBeenCalled();
    });

    it("marks the first board as default", async () => {
      boardsRepo.create.mockResolvedValue(buildBoard({ isDefault: false }));
      boardsRepo.countByProject.mockResolvedValue(1);

      await service.create(project, { name: "First" } as never, userId);

      expect(boardsRepo.setIsDefault).toHaveBeenCalledWith(boardId, true);
    });
  });

  describe("updateColumns", () => {
    it("throws when a status is not in workflow", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await expect(
        service.updateColumns(projectId, boardId, {
          columns: [
            {
              id: "c1",
              name: "X",
              statusIds: ["s-bogus"],
              ordinal: 0,
            },
          ],
        } as never),
      ).rejects.toThrow(ValidationError);
    });

    it("throws when not every workflow status is covered", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await expect(
        service.updateColumns(projectId, boardId, {
          columns: [
            {
              id: "c1",
              name: "Only",
              statusIds: ["s1", "s2"],
              ordinal: 0,
            },
          ],
        } as never),
      ).rejects.toThrow(ValidationError);
    });

    it("updates columns when all statuses are covered", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      boardsRepo.updateColumns.mockResolvedValue(buildBoard());

      await service.updateColumns(projectId, boardId, {
        columns: [
          {
            id: "c1",
            name: "All",
            statusIds: ["s1", "s2", "s3"],
            ordinal: 0,
          },
        ],
      } as never);

      expect(boardsRepo.updateColumns).toHaveBeenCalled();
    });

    it("throws when a status is assigned to more than one column", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await expect(
        service.updateColumns(projectId, boardId, {
          columns: [
            { id: "c1", name: "A", statusIds: ["s1", "s2"], ordinal: 0 },
            { id: "c2", name: "B", statusIds: ["s1", "s3"], ordinal: 1 },
          ],
        } as never),
      ).rejects.toThrow(ValidationError);
    });

    it("accepts a valid re-partition (status moved between columns)", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      boardsRepo.updateColumns.mockResolvedValue(buildBoard());

      await service.updateColumns(projectId, boardId, {
        columns: [
          { id: "c1", name: "To Do", statusIds: ["s1"], ordinal: 0 },
          { id: "c2", name: "Doing", statusIds: ["s2"], ordinal: 1 },
          { id: "c3", name: "Done", statusIds: ["s3"], ordinal: 2 },
        ],
      } as never);

      expect(boardsRepo.updateColumns).toHaveBeenCalled();
    });
  });

  describe("setColumnsForImport", () => {
    it("accepts partial coverage — a status without a column stays hidden", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      boardsRepo.updateColumns.mockResolvedValue(buildBoard());

      // s2, s3 intentionally uncovered (mirrors a YouTrack board that has no
      // column for e.g. Released) — updateColumns would reject this.
      await service.setColumnsForImport(projectId, boardId, {
        columns: [{ id: "c1", name: "Open", statusIds: ["s1"], ordinal: 0 }],
      } as never);

      expect(boardsRepo.updateColumns).toHaveBeenCalled();
    });

    it("still rejects a status that is not in the workflow", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await expect(
        service.setColumnsForImport(projectId, boardId, {
          columns: [{ id: "c1", name: "X", statusIds: ["s-bogus"], ordinal: 0 }],
        } as never),
      ).rejects.toThrow(ValidationError);
    });

    it("still rejects a status assigned to more than one column", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await expect(
        service.setColumnsForImport(projectId, boardId, {
          columns: [
            { id: "c1", name: "A", statusIds: ["s1"], ordinal: 0 },
            { id: "c2", name: "B", statusIds: ["s1"], ordinal: 1 },
          ],
        } as never),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("setDefault", () => {
    it("atomically replaces the default board", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());

      await service.setDefault(projectId, boardId);

      expect(boardsRepo.setDefaultAtomic).toHaveBeenCalledWith(
        projectId,
        boardId,
      );
    });
  });

  describe("remove", () => {
    it("deletes a non-default board", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ isDefault: false }),
      );
      await service.remove(projectId, boardId);
      expect(boardsRepo.delete).toHaveBeenCalledWith(boardId);
    });

    it("rejects deleting the only default board", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ isDefault: true }),
      );
      boardsRepo.countByProject.mockResolvedValue(1);

      await expect(service.remove(projectId, boardId)).rejects.toThrow(
        ValidationError,
      );
    });

    it("deletes a default board if other boards exist", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ isDefault: true }),
      );
      boardsRepo.countByProject.mockResolvedValue(3);

      await service.remove(projectId, boardId);

      expect(boardsRepo.delete).toHaveBeenCalledWith(boardId);
    });
  });

});
