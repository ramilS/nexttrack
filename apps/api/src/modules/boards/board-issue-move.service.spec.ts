import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundError,
  ValidationError,
  PermissionDeniedError,
} from "@/common/errors/domain.errors";
import { BoardType, SprintStatus, SwimlaneBy } from "@prisma/client";
import { BoardIssueMoveService } from "./board-issue-move.service";
import { BoardsRepository, BoardEntity } from "./boards.repository";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { IssuesRepository } from "@/modules/issues/issues.repository";
import { SprintsRepository } from "@/modules/sprints/sprints.repository";
import { ActivitiesService } from "@/modules/activities/activities.service";
import { TransactionService } from "@/common/repository/transaction.service";
import type { Tx } from "@/common/repository/tx.types";
import type { BoardIssueCard, Workflow } from "@repo/shared/schemas";

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe("BoardIssueMoveService", () => {
  let service: BoardIssueMoveService;
  let boardsRepo: Mocked<BoardsRepository>;
  let workflowsRepo: Mocked<WorkflowsReader>;
  let issuesRepo: Mocked<IssuesRepository>;
  let sprintsRepo: Mocked<SprintsRepository>;
  let activitiesService: { recordOne: jest.Mock };
  let txService: { run: jest.Mock };

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

  const card: BoardIssueCard = {
    id: "issue-1",
    number: 1,
    title: "Test",
    descriptionPreview: null,
    type: "TASK",
    priority: "MEDIUM",
    statusId: "s2",
    projectId,
    assigneeId: null,
    parentId: null,
    assignee: null,
    tags: [],
    estimate: null,
    spent: 0,
    dueDate: null,
    isOverdue: false,
    commentsCount: 0,
    hasAttachments: false,
    childrenCount: 0,
    completedChildrenCount: 0,
    sprintId: null,
  };

  beforeEach(async () => {
    boardsRepo = {
      findEntityInProject: jest.fn(),
    } as unknown as Mocked<BoardsRepository>;

    workflowsRepo = {
      findDefault: jest.fn().mockResolvedValue(workflow),
    } as unknown as Mocked<WorkflowsReader>;

    issuesRepo = {
      findMoveContext: jest.fn(),
      countInStatuses: jest.fn().mockResolvedValue(0),
      findParentScope: jest.fn(),
      findAncestorChain: jest.fn().mockResolvedValue([]),
      updateForBoard: jest.fn().mockResolvedValue(card),
      countActiveBySprint: jest.fn().mockResolvedValue(0),
      countResolvedBySprint: jest.fn().mockResolvedValue(0),
      findParentCascadeContext: jest.fn(),
      countNonDoneSiblings: jest.fn(),
      setStatusForCascade: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IssuesRepository>;

    sprintsRepo = {
      findByIdInBoard: jest.fn(),
      updateCounters: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<SprintsRepository>;

    activitiesService = { recordOne: jest.fn().mockResolvedValue(undefined) };
    txService = {
      run: jest
        .fn()
        .mockImplementation(<T>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardIssueMoveService,
        { provide: BoardsRepository, useValue: boardsRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: SprintsRepository, useValue: sprintsRepo },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: TransactionService, useValue: txService },
      ],
    }).compile();

    service = module.get(BoardIssueMoveService);
  });

  describe("moveIssue", () => {
    const baseIssue = {
      id: "issue-1",
      projectId,
      statusId: "s1",
      sprintId: null,
      parentId: null,
    };

    it("throws NotFoundError when the issue is missing", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(null);

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "missing" } as never,
          userId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when target status is not in workflow", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toStatusId: "bogus" } as never,
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("throws PermissionDeniedError when transition is not allowed for non-admin", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);
      workflowsRepo.findDefault.mockResolvedValue({
        ...workflow,
        transitions: [
          {
            id: "t1",
            name: "Start",
            fromStatusId: "s1",
            toStatusId: "s2",
            requiredRole: null,
          },
        ],
      });

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toStatusId: "s3" } as never,
          userId,
          "DEVELOPER",
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("moves the issue and records a STATUS_CHANGE activity", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);

      await service.moveIssue(
        projectId,
        boardId,
        { issueId: "issue-1", toStatusId: "s2" } as never,
        userId,
      );

      expect(issuesRepo.updateForBoard).toHaveBeenCalledWith(
        "issue-1",
        expect.objectContaining({ statusId: "s2" }),
        expect.anything(),
      );
      expect(activitiesService.recordOne).toHaveBeenCalled();
    });

    it("records activities inside the same transaction as the issue update", async () => {
      const txSentinel = { sentinel: "tx" } as unknown as Tx;
      txService.run.mockImplementation(<T>(fn: (tx: Tx) => Promise<T>) =>
        fn(txSentinel),
      );
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);

      await service.moveIssue(
        projectId,
        boardId,
        { issueId: "issue-1", toStatusId: "s2" } as never,
        userId,
      );

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        "issue-1",
        userId,
        expect.anything(),
        expect.anything(),
        txSentinel,
      );
    });

    it("rejects WIP overflow", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({
          columns: [
            {
              id: "col-1",
              name: "X",
              statusIds: ["s2"],
              ordinal: 0,
              wipLimit: 2,
            },
          ],
        }),
      );
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);
      issuesRepo.countInStatuses.mockResolvedValue(2);

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toStatusId: "s2" } as never,
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects sprint assignment on KANBAN boards", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ type: BoardType.KANBAN }),
      );
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toSprintId: "sp-1" } as never,
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects sprint assignment to a closed sprint", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(
        buildBoard({ type: BoardType.SCRUM }),
      );
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);
      sprintsRepo.findByIdInBoard.mockResolvedValue({
        id: "sp-1",
        boardId,
        name: "S",
        goal: null,
        startDate: null,
        endDate: null,
        status: SprintStatus.CLOSED,
        ordinal: 0,
        totalIssues: 0,
        completedIssues: 0,
        startedAt: null,
        closedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toSprintId: "sp-1" } as never,
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects parent change creating a cycle", async () => {
      boardsRepo.findEntityInProject.mockResolvedValue(buildBoard());
      issuesRepo.findMoveContext.mockResolvedValue(baseIssue);
      issuesRepo.findParentScope.mockResolvedValue({
        id: "parent-1",
        projectId,
      });
      // Cycle: the moved issue is already an ancestor of the new parent
      issuesRepo.findAncestorChain.mockResolvedValue(["parent-1", "issue-1"]);

      await expect(
        service.moveIssue(
          projectId,
          boardId,
          { issueId: "issue-1", toParentId: "parent-1" } as never,
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });
  });
});
