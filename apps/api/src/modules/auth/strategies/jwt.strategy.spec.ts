import { UnauthorizedException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { GlobalRole } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import { mockAuthConfig } from '@test/helpers';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsersReader } from '@/modules/users/users.reader';

describe('JwtStrategy', () => {
  it('rejects a principal that findActiveForJwt excludes (e.g. a SERVICE principal)', async () => {
    const usersRepo = mock<UsersReader>();
    usersRepo.findActiveForJwt.mockResolvedValue(null);
    const strategy = new JwtStrategy(mockAuthConfig, usersRepo);
    const payload: JwtPayload = { sub: 'svc-1', email: 'svc@integrations.invalid', role: 'USER' };

    await expect(strategy.validate(payload)).rejects.toThrow(
      new UnauthorizedException(ErrorCode.TOKEN_INVALID),
    );
    expect(usersRepo.findActiveForJwt).toHaveBeenCalledWith('svc-1');
  });

  it('accepts a principal that findActiveForJwt returns and is not blocked', async () => {
    const usersRepo = mock<UsersReader>();
    usersRepo.findActiveForJwt.mockResolvedValue({
      id: 'user-1',
      email: 'a@test.local',
      name: 'A',
      role: GlobalRole.USER,
      avatarUrl: null,
      isBlocked: false,
    });
    const strategy = new JwtStrategy(mockAuthConfig, usersRepo);
    const payload: JwtPayload = { sub: 'user-1', email: 'a@test.local', role: 'USER' };

    const result = await strategy.validate(payload);

    expect(result.id).toBe('user-1');
  });
});
