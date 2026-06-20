import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  ListIssuesQueryParsed,
  IssueDetail,
  IssueListItem,
  Workflow,
} from '@repo/shared/schemas';
import { IssuesRepository } from './issues.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import { toIssueDetail, toIssueListItem } from './issues.mappers';

/**
 * The read side of issues: paginated lists, single-issue detail and
 * sub-issue children. Extracted from IssuesService, which keeps issue
 * mutations only.
 */
@Injectable()
export class IssuesQueryService {
  constructor(
    private issuesRepo: IssuesRepository,
    private workflowsRepo: WorkflowsReader,
  ) {}

  async findAll(
    project: ProjectEntity,
    dto: ListIssuesQueryParsed,
    userId: string,
  ) {
    const [{ items, meta }, workflow] = await Promise.all([
      this.issuesRepo.findPage(
        { dto, projectId: project.id, currentUserId: userId },
        {
          sortBy: dto.sortBy,
          sortOrder: dto.sortOrder,
          pageSize: dto.pageSize,
          cursor: dto.cursor,
        },
      ),
      this.requireDefaultWorkflow(project.id),
    ]);
    return {
      items: items.map((i): IssueListItem => toIssueListItem(i, workflow.statuses)),
      meta,
    };
  }

  async findByNumber(
    project: ProjectEntity,
    issueNumber: number,
    userId: string,
  ): Promise<IssueDetail> {
    const [issue, workflow] = await Promise.all([
      this.issuesRepo.findDetailByNumber(project.id, issueNumber),
      this.requireDefaultWorkflow(project.id),
    ]);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    return toIssueDetail(issue, workflow.statuses, userId);
  }

  async getChildren(issueId: string): Promise<IssueListItem[]> {
    const [issue, children] = await Promise.all([
      this.issuesRepo.findByIdAny(issueId),
      this.issuesRepo.findChildrenList(issueId),
    ]);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    const workflow = await this.requireDefaultWorkflow(issue.projectId);
    return children.map((c) => toIssueListItem(c, workflow.statuses));
  }

  // ─── Private helpers ───────────────────────────────────────

  private async requireDefaultWorkflow(projectId: string): Promise<Workflow> {
    const workflow = await this.workflowsRepo.findDefault(projectId);
    if (!workflow) {
      throw new NotFoundError(ErrorCode.WORKFLOW_DEFAULT_NOT_FOUND);
    }
    return workflow;
  }
}
