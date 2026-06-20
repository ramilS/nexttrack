import { Injectable } from '@nestjs/common';
import { StatusCategory } from '@prisma/client';
import type {
  WorkflowStatus,
  GanttQueryInput,
  GanttData,
  GanttItem,
  GanttGroup,
} from '@repo/shared/schemas';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { GanttRepository, GanttIssueRow } from './gantt.repository';

@Injectable()
export class GanttService {
  constructor(
    private ganttRepo: GanttRepository,
    private workflowsRepo: WorkflowsReader,
  ) {}

  async getGanttData(projectId: string, dto: GanttQueryInput): Promise<GanttData> {
    const now = new Date();
    const from = dto.from ? new Date(dto.from) : new Date(now.getTime() - 30 * 86400000);
    const to = dto.to ? new Date(dto.to) : new Date(now.getTime() + 60 * 86400000);

    const issues = await this.ganttRepo.findIssuesInRange({
      projectId,
      from,
      to,
      sprintId: dto.sprintId,
      assigneeId: dto.assigneeId,
    });

    const statuses = await this.workflowsRepo.findDefaultStatuses(projectId);
    const statusMap = new Map<string, WorkflowStatus>(
      statuses.map((s) => [s.id, s]),
    );

    const items: GanttItem[] = issues.map((issue) => {
      const status = statusMap.get(issue.statusId);
      const progress = this.calculateProgress(
        issue,
        issue.children,
        status?.category,
      );

      return {
        id: issue.id,
        issueNumber: issue.number,
        key: `${issue.projectKey}-${issue.number}`,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        parentId: issue.parentId,
        status: {
          id: issue.statusId,
          name: status?.name ?? 'Unknown',
          color: status?.color ?? '#6b7280',
          category: status?.category ?? StatusCategory.UNSTARTED,
        },
        assignee: issue.assignee ?? undefined,
        startDate: issue.startDate?.toISOString().split('T')[0] ?? null,
        dueDate: issue.dueDate?.toISOString().split('T')[0] ?? null,
        estimate: issue.estimate,
        progress,
        sprintId: issue.sprint?.id ?? null,
        sprintName: issue.sprint?.name ?? null,
        dependencies: issue.dependencyTargetIds,
        children: issue.children.map((c) => c.id),
      };
    });

    const groups = dto.groupBy !== 'NONE'
      ? this.buildGroups(items, dto.groupBy)
      : undefined;

    return { items, groups };
  }

  calculateProgress(
    issue: { estimate: number | null; spent: number },
    children: GanttIssueRow['children'],
    statusCategory?: string,
  ): number {
    if (issue.estimate && issue.estimate > 0) {
      return Math.min(issue.spent / issue.estimate, 1);
    }

    if (children.length > 0) {
      return 0;
    }

    switch (statusCategory) {
      case StatusCategory.DONE:
        return 1;
      case StatusCategory.STARTED:
        return 0.5;
      default:
        return 0;
    }
  }

  private buildGroups(items: GanttItem[], groupBy: string): GanttGroup[] {
    const groupMap = new Map<string, GanttGroup>();

    for (const item of items) {
      let key: string;
      let label: string;

      switch (groupBy) {
        case 'ASSIGNEE':
          key = item.assignee?.id ?? 'unassigned';
          label = item.assignee?.name ?? 'Unassigned';
          break;
        case 'TYPE':
          key = item.type;
          label = item.type;
          break;
        case 'SPRINT':
          key = item.sprintId ?? 'backlog';
          label = item.sprintName ?? 'Backlog';
          break;
        default:
          continue;
      }

      let group = groupMap.get(key);
      if (!group) {
        group = { key, label, items: [] };
        groupMap.set(key, group);
      }
      group.items.push(item.id);
    }

    return Array.from(groupMap.values());
  }
}
