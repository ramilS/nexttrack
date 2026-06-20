import { Injectable } from "@nestjs/common";
import { NotFoundError } from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import { BoardType, IssueType, SwimlaneBy } from "@prisma/client";
import type {
  BoardColumn,
  BoardColumnData,
  BoardData,
  BoardSwimlaneData,
  BoardQuery,
} from "@repo/shared/schemas";
import { BoardsRepository, BoardEntity, toBoard } from "./boards.repository";
import { IssuesReader } from "@/modules/issues/issues.reader";
import { SprintsReader } from "@/modules/sprints/sprints.reader";
import { BoardIssueRow, toBoardIssueCard } from "./board-issue-card.mapper";

/**
 * The read side of the board: assembles the rendered board (columns,
 * swimlanes, sprint context) from issues. Extracted from BoardsService,
 * which keeps board CRUD/config only.
 */
@Injectable()
export class BoardDataService {
  constructor(
    private boardsRepo: BoardsRepository,
    private issuesRepo: IssuesReader,
    private sprintsReader: SprintsReader,
  ) {}

  async getBoardData(
    projectId: string,
    boardId: string,
    query: BoardQuery,
    _userId: string,
  ): Promise<BoardData> {
    const board = await this.requireBoard(projectId, boardId);

    let sprint = null;
    if (board.type === BoardType.SCRUM) {
      sprint = query.sprintId
        ? await this.sprintsReader.findByIdInBoard(query.sprintId, boardId)
        : await this.sprintsReader.findActiveOrFirstPlanning(boardId);
    }

    const sprintFilter =
      board.type === BoardType.SCRUM
        ? (sprint?.id ?? "__no_active_sprint__")
        : undefined;

    const issues = await this.issuesRepo.findManyForBoardRaw({
      projectId: board.projectId,
      sprintId: sprintFilter,
      assigneeId: query.assigneeId,
      search: query.search,
    });

    const swimlaneBy = query.swimlaneBy ?? board.swimlaneBy;
    const isEpicSwimlane = swimlaneBy === SwimlaneBy.EPIC;
    const storyTypes: IssueType[] = [IssueType.STORY, IssueType.EPIC];
    const cardIssues = isEpicSwimlane
      ? issues.filter((i) => !storyTypes.includes(i.type))
      : issues;

    const columnData = this.partitionIssuesByColumn(cardIssues, board.columns);

    let swimlanes: BoardSwimlaneData[] = [];
    if (swimlaneBy !== SwimlaneBy.NONE) {
      if (isEpicSwimlane) {
        const parentIssues = await this.issuesRepo.findStoryEpicParents(
          board.projectId,
        );
        swimlanes = this.buildEpicSwimlanes(
          cardIssues,
          board.columns,
          parentIssues,
        );
      } else {
        swimlanes = this.buildSwimlanes(cardIssues, board.columns, swimlaneBy);
      }
    }

    return {
      board: toBoard(board),
      sprint,
      columns: columnData,
      swimlanes,
    };
  }

  // ─── Private helpers ────────────────────────────────────────

  private async requireBoard(
    projectId: string,
    boardId: string,
  ): Promise<BoardEntity> {
    const board = await this.boardsRepo.findEntityInProject(projectId, boardId);
    if (!board) {
      throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);
    }
    return board;
  }

  private partitionIssuesByColumn(
    issues: BoardIssueRow[],
    columns: BoardColumn[],
  ): BoardColumnData[] {
    return columns.map((col) => {
      const colIssues = issues.filter((i) =>
        col.statusIds.includes(i.statusId),
      );
      return {
        column: col,
        issues: colIssues.map(toBoardIssueCard),
        totalCount: colIssues.length,
        isOverWip:
          (col.wipLimit ?? 0) > 0 && colIssues.length > (col.wipLimit ?? 0),
      };
    });
  }

  private buildEpicSwimlanes(
    issues: BoardIssueRow[],
    columns: BoardColumn[],
    parentIssues: {
      id: string;
      title: string;
      type: IssueType;
      number: number;
    }[],
  ): BoardSwimlaneData[] {
    type Group = {
      key: string;
      label: string;
      issueNumber?: number;
      issues: BoardIssueRow[];
    };
    const groups = new Map<string, Group>();
    for (const parent of parentIssues) {
      groups.set(`epic:${parent.id}`, {
        key: `epic:${parent.id}`,
        label: parent.title,
        issueNumber: parent.number,
        issues: [],
      });
    }
    groups.set("epic:none", {
      key: "epic:none",
      label: "Uncategorized",
      issues: [],
    });

    for (const issue of issues) {
      const parentType = issue.parent?.type;
      const isStoryParent =
        parentType === IssueType.EPIC || parentType === IssueType.STORY;
      const key =
        issue.parentId && isStoryParent
          ? `epic:${issue.parentId}`
          : "epic:none";
      const group = groups.get(key) ?? groups.get("epic:none")!;
      group.issues.push(issue);
    }

    return Array.from(groups.values()).map((group) => ({
      groupKey: group.key,
      groupLabel: group.label,
      issueNumber: group.issueNumber,
      columns: this.partitionIssuesByColumn(group.issues, columns),
    }));
  }

  private buildSwimlanes(
    issues: BoardIssueRow[],
    columns: BoardColumn[],
    swimlaneBy: string,
  ): BoardSwimlaneData[] {
    type Group = { key: string; label: string; issues: BoardIssueRow[] };
    const groups = new Map<string, Group>();

    for (const issue of issues) {
      let key: string;
      let label: string;
      switch (swimlaneBy) {
        case "ASSIGNEE":
          key = issue.assigneeId
            ? `user:${issue.assigneeId}`
            : "user:unassigned";
          label = issue.assignee?.name ?? "Unassigned";
          break;
        case "PRIORITY":
          key = `priority:${issue.priority}`;
          label = issue.priority;
          break;
        case "TYPE":
          key = `type:${issue.type}`;
          label = issue.type;
          break;
        default:
          continue;
      }
      if (!groups.has(key)) groups.set(key, { key, label, issues: [] });
      groups.get(key)!.issues.push(issue);
    }

    return Array.from(groups.values()).map((group) => ({
      groupKey: group.key,
      groupLabel: group.label,
      columns: this.partitionIssuesByColumn(group.issues, columns),
    }));
  }
}
