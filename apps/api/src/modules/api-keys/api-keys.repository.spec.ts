import { createMockPrisma } from '@test/helpers';
import { ApiKeysRepository } from './api-keys.repository';

describe('ApiKeysRepository.listByProject', () => {
  it('scopes to the project and keeps unrevoked keys plus recently-revoked ones', async () => {
    const prisma = createMockPrisma();
    prisma.projectApiKey.findMany.mockResolvedValue([]);
    const repo = new ApiKeysRepository(prisma);
    const cutoff = new Date('2026-01-01T00:00:00.000Z');

    await repo.listByProject('proj-1', cutoff);

    expect(prisma.projectApiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'proj-1',
          OR: [{ revokedAt: null }, { revokedAt: { gte: cutoff } }],
        },
      }),
    );
  });
});
