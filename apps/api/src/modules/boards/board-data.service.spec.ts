import { Test, TestingModule } from "@nestjs/testing";
import { BoardType, SwimlaneBy } from "@prisma/client";
import { BoardDataService } from "./board-data.service";
import { BoardsRepository, BoardEntity } from "./boards.repository";
import { IssuesReader } from "@/modules/issues/issues.reader";
import { SprintsReader } from "@/modules/sprints/sprints.reader";
import type { BoardIssueRow } from "./board-issue-card.mapper";

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe("BoardDataService", () => {
  let service: BoardDataService;
  let boardsRepo: Mocked<BoardsRepository>;
  let issuesRepo: Mocked<IssuesReader>;
  let sprintsReader: Mocked<SprintsReader>;

  const projectId = "proj-1";
  const boardId = "board-1";

  const board: BoardEntity = {
    id: boardId,
    projectId,
    name: "Board",
    type: BoardType.KANBAN,
    columns: [
      { id: "c1", name: "To Do", statusIds: ["s1"], ordinal: 0, wipLimit: 1 },
      { id: "c2", name: "Done", statusIds: ["s2"], ordinal: 1 },
    ],
    swimlaneBy: SwimlaneBy.NONE,
    filterQuery: null,
    autoCloseOnDone: true,
    isDefault: true,
    createdById: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const issueRow = (overrides: Partial<BoardIssueRow>): BoardIssueRow =>
    ({
      id: "i1",
      number: 1,
      title: "Issue",
      description: null,
      type: "TASK",
      priority: "MEDIUM",
      statusId: "s1",
      projectId,
      assigneeId: null,
      parentId: null,
      sprintId: null,
      estimate: null,
      spent: 0,
      dueDate: null,
      assignee: null,
      parent: null,
      tags: [],
      attachments: [],
      _count: { comments: 0, attachments: 0, children: 0 },
      children: [],
      ...overrides,
    }) as BoardIssueRow;

  beforeEach(async () => {
    boardsRepo = {
      findEntityInProject: jest.fn().mockResolvedValue(board),
    } as unknown as Mocked<BoardsRepository>;
    issuesRepo = {
      findManyForBoardRaw: jest.fn().mockResolvedValue([]),
      findStoryEpicParents: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<IssuesReader>;
    sprintsReader = {
      findByIdInBoard: jest.fn(),
      findActiveOrFirstPlanning: jest.fn().mockResolvedValue(null),
    } as unknown as Mocked<SprintsReader>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardDataService,
        { provide: BoardsRepository, useValue: boardsRepo },
        { provide: IssuesReader, useValue: issuesRepo },
        { provide: SprintsReader, useValue: sprintsReader },
      ],
    }).compile();

    service = module.get(BoardDataService);
  });

  it("partitions issues into columns by statusId and flags WIP overflow", async () => {
    issuesRepo.findManyForBoardRaw.mockResolvedValue([
      issueRow({ id: "i1", statusId: "s1" }),
      issueRow({ id: "i2", statusId: "s1" }),
      issueRow({ id: "i3", statusId: "s2" }),
    ]);

    const data = await service.getBoardData(projectId, boardId, {} as never, "u1");

    expect(data.columns).toHaveLength(2);
    expect(data.columns[0]!.totalCount).toBe(2);
    expect(data.columns[0]!.isOverWip).toBe(true);
    expect(data.columns[1]!.totalCount).toBe(1);
    expect(data.columns[1]!.isOverWip).toBe(false);
    expect(data.swimlanes).toEqual([]);
  });

  it("groups assignee swimlanes with an Unassigned bucket", async () => {
    issuesRepo.findManyForBoardRaw.mockResolvedValue([
      issueRow({
        id: "i1",
        assigneeId: "u2",
        assignee: { id: "u2", name: "Bob", email: "b@t.local", avatarUrl: null },
      }),
      issueRow({ id: "i2" }),
    ]);

    const data = await service.getBoardData(
      projectId,
      boardId,
      { swimlaneBy: SwimlaneBy.ASSIGNEE } as never,
      "u1",
    );

    const labels = data.swimlanes.map((s) => s.groupLabel).sort();
    expect(labels).toEqual(["Bob", "Unassigned"]);
  });

  it("does not query sprints for KANBAN boards", async () => {
    await service.getBoardData(projectId, boardId, {} as never, "u1");

    expect(sprintsReader.findActiveOrFirstPlanning).not.toHaveBeenCalled();
    expect(sprintsReader.findByIdInBoard).not.toHaveBeenCalled();
  });
});
