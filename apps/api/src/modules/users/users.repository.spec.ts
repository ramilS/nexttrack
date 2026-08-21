import { UserKind } from '@prisma/client';
import { createMockPrisma } from '@test/helpers';
import { UsersRepository } from './users.repository';

describe('UsersRepository.findActiveForJwt', () => {
  it('filters on kind: HUMAN, excluding SERVICE principals from every JWT-backed load', async () => {
    const prisma = createMockPrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    const repo = new UsersRepository(prisma);

    await repo.findActiveForJwt('user-1');

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: UserKind.HUMAN }),
      }),
    );
  });
});
