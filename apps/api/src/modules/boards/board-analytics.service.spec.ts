import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundError } from "@/common/errors/domain.errors";
import { BoardType, StatusCategory, SwimlaneBy } from "@prisma/client";
import { BoardAnalyticsService } from "./board-analytics.service";
import { BoardsRepository, BoardEntity } from "./boards.repository";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { IssuesReader } from "@/modules/issues/issues.reader";
import { SprintsReader } from "@/modules/sprints/sprints.reader";
import { ActivitiesRepository } from "@/modules/activities/activities.repository";
import type { Workflow } from "@repo/shared/schemas";

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe("BoardAnalyticsService", () => {
  let service: BoardAnalyticsService;
  let boardsRepo: Mocked<BoardsRepository>;
  let workflowsRepo: Mocked<WorkflowsReader>;
  let issuesRepo: Mocked<IssuesReader>;
  let sprintsReader: Mocked<SprintsReader>;
  let activitiesRepo: Mocked<ActivitiesRepository>;

  const projectId = "project-1";
  const boardId = "board-1";

  const workflow: Workflow = {
    id: "wf-1",
    projectId,
    name: "Default",
    isDefault: true,
    statuses: [
      {
        id: "open",
        name: "Open",
        color: "#gray",
        category: StatusCategory.UNSTARTED,
        isInitial: true,
        isResolved: false,
        ordinal: 0,
      },
      {
        id: "progress",
        name: "In Progress",
        color: "#blue",
        category: StatusCategory.STARTED,
        isInitial: false,
        isResolved: false,
        ordinal: 1,
      },
      {
        id: "done",
        name: "Done",
        color: "#green",
        category: StatusCategory.DONE,
        isInitial: false,
        isResolved: true,
        ordinal: 2,
      },
    ],
    transitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const buildBoard = (overrides?: Partial<BoardEntity>): BoardEntity => ({
    id: boardId,
    projectId,
    name: "B",
    type: BoardType.KANBAN,
    columns: [],
    swimlaneBy: SwimlaneBy.NONE,
    filterQuery: null,
    autoCloseOnDone: true,
    isDefault: true,
    createdById: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    boardsRepo = {
      findEntityInProject: jest.fn(),
    } as unknown as Mocked<BoardsRepository>;

    workflowsRepo = {
      findDefault: jest.fn().mockResolvedValue(workflow),
    } as unknown as Mocked<WorkflowsReader>;

    issuesRepo = {
      findStatusSnapshotForAnalytics: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<IssuesReader>;

    sprintsReader = {
      findClosedWithEstimates: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<SprintsReader>;

    activitiesRepo = {
      findStatusChangesInRange: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<ActivitiesRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardAnalyticsService,
        { provide: BoardsRepository, useValue: boardsRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
        { provide: IssuesReader, useValue: issuesRepo },
        { provide: SprintsReader, useValue: sprintsReader },
        { provide: ActivitiesRepository, useValue: activitiesRepo },
      ],
    }).compile();

    service = module.get(BoardAnalyticsService);
  });

  describe("getCfd", () => {
    it("returns CFD data with dates and per-status series", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findStatusSnapshotForAnalytics.mockResolvedValue([
        { id: "i1", statusId: "open", createdAt: new Date("2026-03-06") },
        { id: "i2", statusId: "progress", createdAt: new Date("2026-03-07") },
        { id: "i3", statusId: "done", createdAt: new Date("2026-03-08") },
      ]);
      activitiesRepo.findStatusChangesInRange.mockResolvedValue([
        {
          issueId: "i2",
          payload: { from: "open", to: "progress" },
          createdAt: new Date("2026-03-08"),
        },
        {
          issueId: "i3",
          payload: { from: "progress", to: "done" },
          createdAt: new Date("2026-03-09"),
        },
      ]);

      const result = await service.getCfd(
        projectId,
        boardId,
        new Date("2026-03-07"),
        new Date("2026-03-09"),
      );

      expect(result.dates).toContain("2026-03-07");
      expect(result.dates).toContain("2026-03-08");
      expect(result.series).toHaveLength(3);
      expect(result.series[0].statusName).toBe("Open");
    });

    it("throws when board is missing", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(null);
      await expect(
        service.getCfd(projectId, boardId, new Date(), new Date()),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws when default workflow is missing", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      workflowsRepo.findDefault.mockResolvedValue(null);
      await expect(
        service.getCfd(projectId, boardId, new Date(), new Date()),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getVelocity", () => {
    it("returns empty velocity for KANBAN boards", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ type: BoardType.KANBAN }),
      );
      const result = await service.getVelocity(projectId, boardId);
      expect(result).toEqual({ sprints: [], averageVelocity: 0 });
    });

    it("computes planned/completed/averageVelocity for SCRUM boards", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ type: BoardType.SCRUM }),
      );
      sprintsReader.findClosedWithEstimates.mockResolvedValue([
        {
          id: "s-2",
          name: "Sprint 2",
          startDate: null,
          endDate: null,
          issues: [
            { estimate: 5, statusId: "done" },
            { estimate: 3, statusId: "progress" },
          ],
        },
        {
          id: "s-1",
          name: "Sprint 1",
          startDate: null,
          endDate: null,
          issues: [{ estimate: 5, statusId: "done" }],
        },
      ]);

      const result = await service.getVelocity(projectId, boardId);

      expect(result.sprints).toHaveLength(2);
      expect(result.sprints[0].name).toBe("Sprint 1");
      expect(result.sprints[0].completed).toBe(5);
      expect(result.sprints[1].planned).toBe(8);
      expect(result.sprints[1].completed).toBe(5);
      expect(result.averageVelocity).toBe(5);
    });

    it("returns 0 averageVelocity when no closed sprints exist", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ type: BoardType.SCRUM }),
      );
      sprintsReader.findClosedWithEstimates.mockResolvedValue([]);

      const result = await service.getVelocity(projectId, boardId);
      expect(result.averageVelocity).toBe(0);
      expect(result.sprints).toEqual([]);
    });
  });
});
