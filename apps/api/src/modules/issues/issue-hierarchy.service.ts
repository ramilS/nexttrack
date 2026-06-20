import { Injectable } from '@nestjs/common';
import { ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { IssuesRepository } from './issues.repository';

const MAX_PARENT_DEPTH = 5;

/**
 * Validates issue re-parenting: the parent must live in the same project, and a
 * new parent edge must not create a cycle or exceed the max nesting depth.
 */
@Injectable()
export class IssueHierarchyService {
  constructor(private issuesRepo: IssuesRepository) {}

  async assertValidParent(projectId: string, parentId: string): Promise<void> {
    const parent = await this.issuesRepo.findParentInProject(projectId, parentId);
    if (!parent) {
      throw new ValidationError(
        ErrorCode.PARENT_DIFFERENT_PROJECT,
        'Parent issue must belong to the same project',
      );
    }
  }

  async assertNoCycle(issueId: string, newParentId: string): Promise<void> {
    const chain = await this.issuesRepo.findAncestorChain(
      newParentId,
      MAX_PARENT_DEPTH + 1,
    );
    if (chain.includes(issueId)) {
      throw new ValidationError(
        ErrorCode.CIRCULAR_PARENT,
        'Circular parent reference detected',
      );
    }
    if (chain.length > MAX_PARENT_DEPTH) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `Maximum nesting depth of ${MAX_PARENT_DEPTH} exceeded`,
      );
    }
  }
}
