import { createMockPrisma } from '@test/helpers';
import { IssuesRepository } from './issues.repository';

describe('IssuesRepository.findDetailById', () => {
  it('scopes the lookup to the project and excludes soft-deleted issues', async () => {
    const prisma = createMockPrisma();
    prisma.issue.findFirst.mockResolvedValue(null);
    const repo = new IssuesRepository(prisma);

    await repo.findDetailById('proj-1', 'issue-1');

    expect(prisma.issue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'issue-1',
          projectId: 'proj-1',
          deletedAt: null,
        }),
      }),
    );
  });
});
