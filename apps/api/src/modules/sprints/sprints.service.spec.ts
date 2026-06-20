import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundError, ValidationError } from "@/common/errors/domain.errors";
import { SprintStatus } from "@prisma/client";
import { SprintsService } from "./sprints.service";
import { SprintsRepository } from "./sprints.repository";
import { IssuesRepository } from "@/modules/issues/issues.repository";
import { BoardsReader } from "@/modules/boards/boards.reader";
import { ProjectMembersRepository } from "@/modules/projects/project-members.repository";
import { TransactionService } from "@/common/repository/transaction.service";
import { NotificationsDispatchService } from "@/modules/notifications/notifications-dispatch.service";
import { BackgroundTasks } from "@/common/background/background-tasks.service";
import type { Sprint } from "@repo/shared/schemas";
import type { Tx } from "@/common/repository/tx.types";

describe("SprintsService", () => {
  let service: SprintsService;
  let sprintsRepo: jest.Mocked<SprintsRepository>;
  let issuesRepo: jest.Mocked<IssuesRepository>;
  let boardsReader: jest.Mocked<BoardsReader>;
  let txService: { run: jest.Mock };
  let notificationsDispatch: { dispatch: jest.Mock };

  const baseSprint = (overrides?: Partial<Sprint>): Sprint => ({
    id: "sprint-1",
    boardId: "board-1",
    name: "Sprint 1",
    goal: null,
    status: SprintStatus.PLANNING,
    ordinal: 0,
    startDate: null,
    endDate: null,
    startedAt: null,
    closedAt: null,
    totalIssues: 0,
    completedIssues: 0,
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
    ...overrides,
  });

  beforeEach(async () => {
    notificationsDispatch = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    txService = {
      run: jest
        .fn()
        .mockImplementation(<T>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx)),
    };

    const sprintsRepoMock: jest.Mocked<SprintsRepository> = {
      findPage: jest.fn(),
      findById: jest.fn(),
      findActiveOnBoard: jest.fn(),
      maxOrdinal: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findOpenSprintsWithCards: jest.fn(),
      findBacklogCards: jest.fn(),
      findBacklogCardsCursor: jest.fn(),
    } as unknown as jest.Mocked<SprintsRepository>;

    const issuesRepoMock: jest.Mocked<IssuesRepository> = {
      findProjectIdById: jest.fn(),
      findIssueRef: jest.fn(),
      countActiveBySprint: jest.fn(),
      countResolvedBySprint: jest.fn(),
      findResolvedAtsBySprint: jest.fn(),
      findSprintIssueStats: jest.fn(),
      assignToSprintForProject: jest.fn(),
      removeFromSprint: jest.fn(),
      moveToSprint: jest.fn(),
      clearSprint: jest.fn(),
    } as unknown as jest.Mocked<IssuesRepository>;

    const boardsReaderMock: jest.Mocked<BoardsReader> = {
      findRefById: jest.fn(),
      findRefWithProjectName: jest.fn(),
    } as unknown as jest.Mocked<BoardsReader>;

    const projectMembersRepoMock: jest.Mocked<ProjectMembersRepository> = {
      isMember: jest.fn(),
      findMemberIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ProjectMembersRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintsService,
        { provide: SprintsRepository, useValue: sprintsRepoMock },
        { provide: IssuesRepository, useValue: issuesRepoMock },
        { provide: BoardsReader, useValue: boardsReaderMock },
        { provide: ProjectMembersRepository, useValue: projectMembersRepoMock },
        { provide: TransactionService, useValue: txService },
        {
          provide: NotificationsDispatchService,
          useValue: notificationsDispatch,
        },
        BackgroundTasks,
      ],
    }).compile();

    service = module.get(SprintsService);
    sprintsRepo = module.get(SprintsRepository);
    issuesRepo = module.get(IssuesRepository);
    boardsReader = module.get(BoardsReader);
  });

  describe("findOne", () => {
    it("should return sprint", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());

      const result = await service.findOne("board-1", "sprint-1");

      expect(result.name).toBe("Sprint 1");
    });

    it("should throw NotFoundError when sprint missing", async () => {
      sprintsRepo.findById.mockResolvedValue(null);

      await expect(service.findOne("board-1", "missing")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("getBurndown", () => {
    it("uses a COUNT for the total and only the resolved timestamps (no full-row load)", async () => {
      sprintsRepo.findById.mockResolvedValue(
        baseSprint({
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-01-05T00:00:00.000Z",
        }),
      );
      issuesRepo.countActiveBySprint.mockResolvedValue(4);
      issuesRepo.findResolvedAtsBySprint.mockResolvedValue([
        new Date("2026-01-02T12:00:00.000Z").getTime(),
        new Date("2026-01-04T12:00:00.000Z").getTime(),
      ]);

      const result = await service.getBurndown("board-1", "sprint-1");

      // Total comes from the DB COUNT, cumulative from the resolved-timestamp subset.
      expect(issuesRepo.countActiveBySprint).toHaveBeenCalledWith("sprint-1");
      expect(issuesRepo.findResolvedAtsBySprint).toHaveBeenCalledWith(
        "sprint-1",
      );
      // The whole point of the fix: it must NOT load every sprint issue row.
      expect(issuesRepo.findSprintIssueStats).not.toHaveBeenCalled();

      // Flat point series (one entry per sprint day) that the chart plots directly.
      expect(result).toHaveLength(5);
      expect(result[0]!.actual).toBe(4); // day 1: none resolved yet
      expect(result[4]!.actual).toBe(2); // last day: both resolved
      expect(result[0]!.ideal).toBe(4); // ideal starts at the full total
      expect(result[4]!.ideal).toBe(0); // ...and burns down to zero
      expect(result[4]!.completed).toBe(2); // total(4) - remaining(2)
    });
  });

  describe("create", () => {
    it("should create a sprint with next ordinal for a SCRUM board", async () => {
      boardsReader.findRefById.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "SCRUM",
      });
      sprintsRepo.maxOrdinal.mockResolvedValue(2);
      sprintsRepo.create.mockResolvedValue(baseSprint({ ordinal: 3 }));

      const result = await service.create("board-1", { name: "Sprint 1" });

      expect(result.ordinal).toBe(3);
      expect(sprintsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: "board-1",
          name: "Sprint 1",
          ordinal: 3,
        }),
      );
    });

    it("should throw NotFoundError when board does not exist", async () => {
      boardsReader.findRefById.mockResolvedValue(null);

      await expect(service.create("missing", { name: "x" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should throw ValidationError for non-SCRUM boards", async () => {
      boardsReader.findRefById.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "KANBAN",
      });

      await expect(service.create("board-1", { name: "x" })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("update", () => {
    it("should update sprint when not closed", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      sprintsRepo.update.mockResolvedValue(baseSprint({ name: "Renamed" }));

      const result = await service.update("board-1", "sprint-1", {
        name: "Renamed",
      });

      expect(result.name).toBe("Renamed");
      expect(sprintsRepo.update).toHaveBeenCalledWith("sprint-1", {
        name: "Renamed",
      });
    });

    it("should throw ValidationError when sprint is closed", async () => {
      sprintsRepo.findById.mockResolvedValue(
        baseSprint({ status: SprintStatus.CLOSED }),
      );

      await expect(
        service.update("board-1", "sprint-1", { name: "x" }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("start", () => {
    it("should start a planning sprint that has issues", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      sprintsRepo.findActiveOnBoard.mockResolvedValue(null);
      issuesRepo.countActiveBySprint.mockResolvedValue(5);
      sprintsRepo.update.mockResolvedValue(
        baseSprint({ status: SprintStatus.ACTIVE, totalIssues: 5 }),
      );
      boardsReader.findRefWithProjectName.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "SCRUM",
        projectName: "Test Project",
      });

      const result = await service.start("board-1", "sprint-1", "user-1");

      expect(result.status).toBe(SprintStatus.ACTIVE);
      expect(sprintsRepo.update).toHaveBeenCalledWith(
        "sprint-1",
        expect.objectContaining({
          status: SprintStatus.ACTIVE,
          totalIssues: 5,
        }),
      );
    });

    it("should throw when another sprint is already active", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      sprintsRepo.findActiveOnBoard.mockResolvedValue(
        baseSprint({ id: "sprint-2", status: SprintStatus.ACTIVE }),
      );

      await expect(
        service.start("board-1", "sprint-1", "user-1"),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw when sprint has no issues", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      sprintsRepo.findActiveOnBoard.mockResolvedValue(null);
      issuesRepo.countActiveBySprint.mockResolvedValue(0);

      await expect(
        service.start("board-1", "sprint-1", "user-1"),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw when sprint is not in PLANNING status", async () => {
      sprintsRepo.findById.mockResolvedValue(
        baseSprint({ status: SprintStatus.ACTIVE }),
      );

      await expect(
        service.start("board-1", "sprint-1", "user-1"),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("close", () => {
    const activeSprint = baseSprint({ status: SprintStatus.ACTIVE });

    it("should close active sprint and move incomplete issues to backlog", async () => {
      sprintsRepo.findById.mockResolvedValue(activeSprint);
      issuesRepo.findSprintIssueStats.mockResolvedValue([
        { id: "i1", resolvedAt: "2026-05-13T00:00:00.000Z", estimate: 5 },
        { id: "i2", resolvedAt: null, estimate: 3 },
      ]);
      sprintsRepo.update.mockResolvedValue(
        baseSprint({ status: SprintStatus.CLOSED }),
      );

      const result = await service.close("board-1", "sprint-1", {
        incompleteIssuesAction: "MOVE_TO_BACKLOG",
      });

      expect(result.completedIssues).toBe(1);
      expect(result.incompleteIssues).toBe(1);
      expect(result.movedToBacklog).toBe(1);
      expect(result.velocityPoints).toBe(5);
      expect(issuesRepo.moveToSprint).toHaveBeenCalledWith(
        ["i2"],
        null,
        expect.anything(),
      );
    });

    it("should move incomplete issues to next sprint when requested", async () => {
      sprintsRepo.findById
        .mockResolvedValueOnce(activeSprint)
        .mockResolvedValueOnce(baseSprint({ id: "sprint-2" }));
      issuesRepo.findSprintIssueStats.mockResolvedValue([
        { id: "i1", resolvedAt: null, estimate: 2 },
      ]);
      issuesRepo.countActiveBySprint.mockResolvedValue(3);
      issuesRepo.countResolvedBySprint.mockResolvedValue(1);
      sprintsRepo.update.mockResolvedValue(
        baseSprint({ status: SprintStatus.CLOSED }),
      );

      const result = await service.close("board-1", "sprint-1", {
        incompleteIssuesAction: "MOVE_TO_NEXT_SPRINT",
        nextSprintId: "sprint-2",
      });

      expect(result.movedToSprint).toBe(1);
      expect(issuesRepo.moveToSprint).toHaveBeenCalledWith(
        ["i1"],
        "sprint-2",
        expect.anything(),
      );
    });

    it("should throw NotFoundError when sprint is missing", async () => {
      sprintsRepo.findById.mockResolvedValue(null);

      await expect(
        service.close("board-1", "missing", {
          incompleteIssuesAction: "MOVE_TO_BACKLOG",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw when sprint is not active", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());

      await expect(
        service.close("board-1", "sprint-1", {
          incompleteIssuesAction: "MOVE_TO_BACKLOG",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("remove", () => {
    it("should delete sprint and clear assigned issues", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());

      await service.remove("board-1", "sprint-1");

      expect(issuesRepo.clearSprint).toHaveBeenCalledWith(
        "sprint-1",
        expect.anything(),
      );
      expect(sprintsRepo.delete).toHaveBeenCalledWith(
        "sprint-1",
        expect.anything(),
      );
    });

    it("should throw when sprint is not in PLANNING status", async () => {
      sprintsRepo.findById.mockResolvedValue(
        baseSprint({ status: SprintStatus.ACTIVE }),
      );

      await expect(service.remove("board-1", "sprint-1")).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("addIssues", () => {
    it("should add issues to a non-closed sprint and recalculate counters", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      boardsReader.findRefById.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "SCRUM",
      });
      issuesRepo.assignToSprintForProject.mockResolvedValue(2);
      issuesRepo.countActiveBySprint.mockResolvedValue(2);
      issuesRepo.countResolvedBySprint.mockResolvedValue(0);

      const result = await service.addIssues("board-1", "sprint-1", [
        "i1",
        "i2",
      ]);

      expect(result.added).toBe(2);
      expect(issuesRepo.assignToSprintForProject).toHaveBeenCalledWith(
        ["i1", "i2"],
        "sprint-1",
        "proj-1",
      );
      expect(sprintsRepo.update).toHaveBeenCalledWith("sprint-1", {
        totalIssues: 2,
        completedIssues: 0,
      });
    });

    it("should throw when board is not SCRUM", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      boardsReader.findRefById.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "KANBAN",
      });

      await expect(
        service.addIssues("board-1", "sprint-1", ["i1"]),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw when sprint is closed", async () => {
      sprintsRepo.findById.mockResolvedValue(
        baseSprint({ status: SprintStatus.CLOSED }),
      );
      boardsReader.findRefById.mockResolvedValue({
        id: "board-1",
        projectId: "proj-1",
        type: "SCRUM",
      });

      await expect(
        service.addIssues("board-1", "sprint-1", ["i1"]),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("removeIssues", () => {
    it("should remove issues from sprint and recalculate counters", async () => {
      sprintsRepo.findById.mockResolvedValue(baseSprint());
      issuesRepo.removeFromSprint.mockResolvedValue(1);
      issuesRepo.countActiveBySprint.mockResolvedValue(0);
      issuesRepo.countResolvedBySprint.mockResolvedValue(0);

      const result = await service.removeIssues("board-1", "sprint-1", ["i1"]);

      expect(result.removed).toBe(1);
      expect(sprintsRepo.update).toHaveBeenCalled();
    });
  });
});
