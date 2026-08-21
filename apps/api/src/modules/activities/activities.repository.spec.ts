import { createMockPrisma } from '@test/helpers';
import { ActivitiesRepository } from './activities.repository';

describe('ActivitiesRepository', () => {
  describe('actor select', () => {
    it('selects kind on create() so the response can carry the actor kind', async () => {
      const prisma = createMockPrisma();
      prisma.activity.create.mockResolvedValue({} as never);
      const repo = new ActivitiesRepository(prisma);

      await repo.create({
        issueId: 'issue-1',
        actorId: 'user-1',
        type: 'ISSUE_CREATED',
        payload: {},
      });

      expect(prisma.activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { actor: { select: expect.objectContaining({ kind: true }) } },
        }),
      );
    });

    it('selects kind on findByIssue() so the response can carry the actor kind', async () => {
      const prisma = createMockPrisma();
      prisma.activity.findMany.mockResolvedValue([]);
      const repo = new ActivitiesRepository(prisma);

      await repo.findByIssue('issue-1');

      expect(prisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { actor: { select: expect.objectContaining({ kind: true }) } },
        }),
      );
    });
  });
});
