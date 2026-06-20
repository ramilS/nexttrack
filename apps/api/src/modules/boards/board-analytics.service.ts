import { Injectable } from "@nestjs/common";
import { NotFoundError } from "@/common/errors/domain.errors";
import { BoardType, StatusCategory } from "@prisma/client";
import { ErrorCode } from "@repo/shared/error-codes";
import { BoardsRepository } from "./boards.repository";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { IssuesReader } from "@/modules/issues/issues.reader";
import { SprintsReader } from "@/modules/sprints/sprints.reader";
import { ActivitiesRepository } from "@/modules/activities/activities.repository";
import type { CfdResponse, VelocityResponse, Workflow } from "@repo/shared/schemas";

@Injectable()
export class BoardAnalyticsService {
  constructor(
    private boardsRepo: BoardsRepository,
    private workflowsRepo: WorkflowsReader,
    private issuesRepo: IssuesReader,
    private sprintsReader: SprintsReader,
    private activitiesRepo: ActivitiesRepository,
  ) {}

  async getCfd(
    projectId: string,
    boardId: string,
    from: Date,
    to: Date,
    interval: "day" | "week" = "day",
  ): Promise<CfdResponse> {
    const [, workflow] = await Promise.all([
      this.requireBoard(projectId, boardId),
      this.requireDefaultWorkflow(projectId),
    ]);
    const statuses = workflow.statuses;

    const issues = await this.issuesRepo.findStatusSnapshotForAnalytics(
      projectId,
      to,
    );
    const activities = await this.activitiesRepo.findStatusChangesInRange(
      issues.map((i) => i.id),
      from,
      to,
    );

    const dates = this.generateDateRange(from, to, interval);

    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const currentStatus = new Map<string, string>();
    for (const issue of issues) currentStatus.set(issue.id, issue.statusId);

    const sortedActivities = [...activities].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const snapshots: Map<string, Map<string, number>> = new Map();
    const stateMap = new Map(currentStatus);
    const reversedDates = [...dates].reverse();
    let actIdx = 0;

    for (const date of reversedDates) {
      const dateEnd = this.getDateEnd(date, interval);

      while (
        actIdx < sortedActivities.length &&
        sortedActivities[actIdx].createdAt > dateEnd
      ) {
        const act = sortedActivities[actIdx];
        const payload = act.payload as Record<string, unknown> | null;
        if (payload?.from) {
          stateMap.set(act.issueId, payload.from as string);
        }
        actIdx++;
      }

      const counts = new Map<string, number>();
      for (const status of statuses) counts.set(status.id, 0);

      for (const [issueId, statusId] of stateMap) {
        const issue = issueById.get(issueId);
        if (issue && issue.createdAt <= dateEnd) {
          counts.set(statusId, (counts.get(statusId) ?? 0) + 1);
        }
      }

      snapshots.set(date, counts);
    }

    const series = statuses.map((status) => ({
      statusId: status.id,
      statusName: status.name,
      color: status.color,
      category: status.category,
      counts: dates.map((d) => snapshots.get(d)?.get(status.id) ?? 0),
    }));

    return { dates, series };
  }

  async getVelocity(
    projectId: string,
    boardId: string,
    limit: number = 10,
  ): Promise<VelocityResponse> {
    const board = await this.requireBoard(projectId, boardId);

    if (board.type !== BoardType.SCRUM) {
      return { sprints: [], averageVelocity: 0 };
    }

    const workflow = await this.requireDefaultWorkflow(projectId);
    const doneStatusIds = workflow.statuses
      .filter((s) => s.category === StatusCategory.DONE)
      .map((s) => s.id);

    const closedSprints = await this.sprintsReader.findClosedWithEstimates(
      boardId,
      limit,
    );

    const sprints = closedSprints.reverse().map((sprint) => {
      const planned = sprint.issues.reduce(
        (sum, i) => sum + (i.estimate ?? 0),
        0,
      );
      const completed = sprint.issues
        .filter((i) => doneStatusIds.includes(i.statusId))
        .reduce((sum, i) => sum + (i.estimate ?? 0), 0);

      return {
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate?.toISOString() ?? null,
        endDate: sprint.endDate?.toISOString() ?? null,
        planned,
        completed,
      };
    });

    const totalCompleted = sprints.reduce((sum, s) => sum + s.completed, 0);
    const averageVelocity =
      sprints.length > 0 ? Math.round(totalCompleted / sprints.length) : 0;

    return { sprints, averageVelocity };
  }

  // ─── Private ───────────────────────────────────────────────

  private async requireBoard(projectId: string, boardId: string) {
    const board = await this.boardsRepo.findEntityInProject(projectId, boardId);
    if (!board) {
      throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);
    }
    return board;
  }

  private async requireDefaultWorkflow(projectId: string): Promise<Workflow> {
    const workflow = await this.workflowsRepo.findDefault(projectId);
    if (!workflow) {
      throw new NotFoundError(ErrorCode.WORKFLOW_DEFAULT_NOT_FOUND);
    }
    return workflow;
  }

  private generateDateRange(
    from: Date,
    to: Date,
    interval: "day" | "week",
  ): string[] {
    const dates: string[] = [];
    const current = new Date(from);
    current.setHours(0, 0, 0, 0);

    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      if (interval === "week") {
        current.setDate(current.getDate() + 7);
      } else {
        current.setDate(current.getDate() + 1);
      }
    }
    return dates;
  }

  private getDateEnd(dateStr: string, interval: "day" | "week"): Date {
    const date = new Date(dateStr);
    if (interval === "week") {
      date.setDate(date.getDate() + 6);
    }
    date.setHours(23, 59, 59, 999);
    return date;
  }
}
