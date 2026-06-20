import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@repo/shared/error-codes';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';

/**
 * Guard that resolves `req.project` from the `:issueId` route param.
 *
 * Must be registered BEFORE `PermissionGuard` in the guards array
 * so that `req.project` is available when permissions are checked.
 */
@Injectable()
export class IssueContextGuard implements CanActivate {
  constructor(
    private issuesRepo: IssuesReader,
    private projectsRepo: ProjectsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const issueId = req.params.issueId;

    if (issueId && !req.project) {
      const issue = await this.issuesRepo.findIssueRef(issueId);

      if (!issue) {
        throw new NotFoundException(ErrorCode.ISSUE_NOT_FOUND);
      }

      const project = await this.projectsRepo.findActiveById(issue.projectId);

      if (!project) {
        throw new NotFoundException(ErrorCode.PROJECT_NOT_FOUND);
      }

      req.issue = issue;
      req.project = project;
    }

    return true;
  }
}
