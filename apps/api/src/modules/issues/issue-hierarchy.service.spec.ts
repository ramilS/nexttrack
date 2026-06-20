import { ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { IssueHierarchyService } from './issue-hierarchy.service';
import { IssuesRepository } from './issues.repository';

describe('IssueHierarchyService', () => {
  let service: IssueHierarchyService;
  let issuesRepo: { findParentInProject: jest.Mock; findAncestorChain: jest.Mock };

  beforeEach(() => {
    issuesRepo = {
      findParentInProject: jest.fn(),
      findAncestorChain: jest.fn().mockResolvedValue([]),
    };
    service = new IssueHierarchyService(
      issuesRepo as unknown as IssuesRepository,
    );
  });

  describe('assertValidParent', () => {
    it('passes when the parent exists in the project', async () => {
      issuesRepo.findParentInProject.mockResolvedValue({ id: 'p1' });
      await expect(service.assertValidParent('proj', 'p1')).resolves.toBeUndefined();
    });

    it('rejects when the parent is missing / in another project', async () => {
      issuesRepo.findParentInProject.mockResolvedValue(null);
      await expect(service.assertValidParent('proj', 'p1')).rejects.toMatchObject({
        code: ErrorCode.PARENT_DIFFERENT_PROJECT,
      });
    });
  });

  describe('assertNoCycle', () => {
    it('passes for a short, acyclic ancestor chain', async () => {
      issuesRepo.findAncestorChain.mockResolvedValue(['p1', 'p2']);
      await expect(service.assertNoCycle('i1', 'p1')).resolves.toBeUndefined();
    });

    it('rejects when the new parent chain contains the issue itself (cycle)', async () => {
      issuesRepo.findAncestorChain.mockResolvedValue(['p1', 'i1']);
      await expect(service.assertNoCycle('i1', 'p1')).rejects.toMatchObject({
        code: ErrorCode.CIRCULAR_PARENT,
      });
    });

    it('rejects when the chain exceeds the maximum nesting depth', async () => {
      issuesRepo.findAncestorChain.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f']);
      await expect(service.assertNoCycle('i1', 'a')).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });
});
