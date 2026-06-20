import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IssueContextGuard } from './issue-context.guard';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { createMockExecutionContext } from '@test/helpers/mock-execution-context';
import { buildProject } from '@test/helpers/factories';
import { ErrorCode } from '@repo/shared/error-codes';

describe('IssueContextGuard', () => {
  let guard: IssueContextGuard;
  let issuesRepo: { findIssueRef: jest.Mock };
  let projectsRepo: { findActiveById: jest.Mock };

  beforeEach(async () => {
    issuesRepo = { findIssueRef: jest.fn() };
    projectsRepo = { findActiveById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueContextGuard,
        { provide: IssuesReader, useValue: issuesRepo },
        { provide: ProjectsRepository, useValue: projectsRepo },
      ],
    }).compile();

    guard = module.get(IssueContextGuard);
  });

  it('should set req.project and req.issue when issueId is present', async () => {
    const project = buildProject();
    const issue = { id: 'i1', projectId: project.id, title: 't' };

    issuesRepo.findIssueRef.mockResolvedValue(issue);
    projectsRepo.findActiveById.mockResolvedValue(project);

    const ctx = createMockExecutionContext({
      params: { issueId: issue.id },
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest<{
      project: unknown;
      issue: { id: string; projectId: string };
    }>();
    expect(req.project).toEqual(project);
    expect(req.issue.id).toBe(issue.id);
    expect(req.issue.projectId).toBe(project.id);
  });

  it('should skip if req.project is already set', async () => {
    const existingProject = buildProject();
    const ctx = createMockExecutionContext({
      params: { issueId: 'some-id' },
      project: existingProject,
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(issuesRepo.findIssueRef).not.toHaveBeenCalled();
  });

  it('should skip if no issueId param', async () => {
    const ctx = createMockExecutionContext({ params: {} });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(issuesRepo.findIssueRef).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when issue not found', async () => {
    issuesRepo.findIssueRef.mockResolvedValue(null);

    const ctx = createMockExecutionContext({
      params: { issueId: 'non-existent' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ErrorCode.ISSUE_NOT_FOUND);
  });

  it('should throw NotFoundException when project is deleted', async () => {
    issuesRepo.findIssueRef.mockResolvedValue({
      id: 'i1',
      projectId: 'p1',
      title: 't',
    });
    projectsRepo.findActiveById.mockResolvedValue(null);

    const ctx = createMockExecutionContext({
      params: { issueId: 'i1' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });
});
