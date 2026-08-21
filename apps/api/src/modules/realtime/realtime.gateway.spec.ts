import { mock, MockProxy } from 'jest-mock-extended';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { GlobalRole } from '@prisma/client';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from './presence.service';
import { TypingService } from './typing.service';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { UsersReader } from '@/modules/users/users.reader';

type AuthenticatedSocketMock = MockProxy<Socket> &
  Socket & { userId: string; isAdmin: boolean };

function buildSocket(token: string): AuthenticatedSocketMock {
  const socket = mock<Socket>({
    id: 'socket-1',
    // cookie/authorization must be explicit `undefined`, not merely absent —
    // jest-mock-extended auto-mocks an unseeded property as a jest.fn(),
    // which breaks handleConnection's `cookies?.split(...)` with a real
    // TypeError, sending every test down the catch-and-disconnect path
    // regardless of the SERVICE-principal logic under test.
    handshake: { headers: { cookie: undefined, authorization: undefined }, auth: { token } },
  });
  return socket as AuthenticatedSocketMock;
}

function buildGateway(usersRepo: MockProxy<UsersReader>) {
  const jwtService = mock<JwtService>();
  jwtService.verify.mockReturnValue({ sub: 'principal-1' });

  return new RealtimeGateway(
    jwtService,
    mock<ProjectMembersRepository>(),
    mock<IssuesReader>(),
    usersRepo,
    mock<PresenceService>(),
    mock<TypingService>(),
  );
}

describe('RealtimeGateway.handleConnection', () => {
  it('disconnects when the principal findActiveForJwt excludes (e.g. a SERVICE principal)', async () => {
    const usersRepo = mock<UsersReader>();
    usersRepo.findActiveForJwt.mockResolvedValue(null);
    const gateway = buildGateway(usersRepo);
    const socket = buildSocket('signed-token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('keeps the connection open for a principal findActiveForJwt returns, not blocked', async () => {
    const usersRepo = mock<UsersReader>();
    usersRepo.findActiveForJwt.mockResolvedValue({
      id: 'principal-1',
      email: 'a@test.local',
      name: 'A',
      role: GlobalRole.USER,
      avatarUrl: null,
      isBlocked: false,
    });
    const gateway = buildGateway(usersRepo);
    const socket = buildSocket('signed-token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
