import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { GlobalRole } from '@prisma/client';
import { AppLogger } from '@/common/logging/app-logger';
import { PresenceService } from './presence.service';
import { TypingService } from './typing.service';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { UsersReader } from '@/modules/users/users.reader';
import { ErrorCode } from '@repo/shared/error-codes';
import { z } from 'zod';

interface AuthenticatedSocket extends Socket {
  userId: string;
  isAdmin: boolean;
}

const projectIdSchema = z.object({
  projectId: z.guid(),
});

const issueIdSchema = z.object({
  issueId: z.guid(),
});

const userIdsSchema = z.object({
  userIds: z.array(z.guid()).min(1).max(100),
});

const MEMBERSHIP_CACHE_TTL_MS = 30_000; // 30 seconds

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new AppLogger(RealtimeGateway.name);
  private membershipCache = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private membersRepo: ProjectMembersRepository,
    private issuesRepo: IssuesReader,
    private usersRepo: UsersReader,
    private presenceService: PresenceService,
    private typingService: TypingService,
  ) {}

  /**
   * Resolves the issue and asserts the socket's user can access its project.
   * Shared by join:issue and the typing handlers so none of them can leak a
   * room to a non-member who merely knows the issueId.
   */
  private async assertIssueAccess(
    client: AuthenticatedSocket,
    issueId: string,
  ): Promise<void> {
    const issue = await this.issuesRepo.findIssueRef(issueId);
    if (!issue) {
      throw new WsException(ErrorCode.ISSUE_NOT_FOUND);
    }
    if (!(await this.canAccessProject(client, issue.projectId))) {
      throw new WsException(ErrorCode.NOT_PROJECT_MEMBER);
    }
  }

  /**
   * Global admins bypass project membership — mirrors the HTTP PermissionGuard
   * (`req.user.role === ADMIN`). Everyone else must be a project member.
   */
  private async canAccessProject(
    client: AuthenticatedSocket,
    projectId: string,
  ): Promise<boolean> {
    if (client.isAdmin) return true;
    return this.isProjectMember(client.userId, projectId);
  }

  private async isProjectMember(userId: string, projectId: string): Promise<boolean> {
    const cacheKey = `${userId}:${projectId}`;
    const cached = this.membershipCache.get(cacheKey);
    if (cached && Date.now() - cached < MEMBERSHIP_CACHE_TTL_MS) {
      return true;
    }

    const isMember = await this.membersRepo.isMember(userId, projectId);

    if (isMember) {
      this.membershipCache.set(cacheKey, Date.now());
      return true;
    }

    this.membershipCache.delete(cacheKey);
    return false;
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Read token from: auth payload, Authorization header, or httpOnly cookie
      const cookies = client.handshake.headers?.cookie;
      const accessTokenCookie = cookies
        ?.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('access_token='))
        ?.split('=')[1];

      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        accessTokenCookie;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      // Set userId + mark online BEFORE the async user lookup. Two reasons:
      // (1) a message racing ahead of this async handler sees an authenticated
      // socket rather than an undefined userId; (2) presence is registered
      // before any await, so a near-instant connect→disconnect can't let the
      // later setOnline land after handleDisconnect's setOffline (stuck-online).
      client.userId = payload.sub;
      client.join(`user:${client.userId}`);
      await this.presenceService.setOnline(client.userId);

      // Mirror the HTTP JwtStrategy: a valid signature is not enough — the user
      // must still exist (not soft-deleted) and not be blocked. Otherwise a
      // blocked/deleted user with a live access token could hold a socket.
      const user = await this.usersRepo.findActiveForJwt(payload.sub);
      if (!user || user.isBlocked) {
        client.disconnect();
        return;
      }
      client.isAdmin = user.role === GlobalRole.ADMIN;

      this.logger.log('WS client connected', { userId: client.userId, socketId: client.id });
    } catch (error) {
      this.logger.warn('WS auth failed', {
        socketId: client.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      await this.presenceService.setOffline(client.userId);
      this.logger.log('WS client disconnected', { userId: client.userId, socketId: client.id });
    }
  }

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = projectIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }

    if (!(await this.canAccessProject(client, parsed.data.projectId))) {
      throw new WsException(ErrorCode.NOT_PROJECT_MEMBER);
    }

    client.join(`project:${parsed.data.projectId}`);
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = projectIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }
    client.leave(`project:${parsed.data.projectId}`);
  }

  @SubscribeMessage('join:issue')
  async handleJoinIssue(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = issueIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }

    await this.assertIssueAccess(client, parsed.data.issueId);

    client.join(`issue:${parsed.data.issueId}`);
  }

  @SubscribeMessage('leave:issue')
  handleLeaveIssue(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = issueIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }
    client.leave(`issue:${parsed.data.issueId}`);
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = issueIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }

    await this.assertIssueAccess(client, parsed.data.issueId);

    await this.typingService.startTyping(client.userId, parsed.data.issueId);
    client.to(`issue:${parsed.data.issueId}`).emit('typing:update', {
      userId: client.userId,
      issueId: parsed.data.issueId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = issueIdSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }

    await this.assertIssueAccess(client, parsed.data.issueId);

    await this.typingService.stopTyping(client.userId, parsed.data.issueId);
    client.to(`issue:${parsed.data.issueId}`).emit('typing:update', {
      userId: client.userId,
      issueId: parsed.data.issueId,
      isTyping: false,
    });
  }

  @SubscribeMessage('presence:check')
  async handlePresenceCheck(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: unknown,
  ) {
    const parsed = userIdsSchema.safeParse(data);
    if (!parsed.success) {
      throw new WsException(ErrorCode.VALIDATION_ERROR);
    }

    const onlineUsers = await this.presenceService.getOnlineUsers(parsed.data.userIds);
    client.emit('presence:status', { onlineUsers });
  }

  sendToUser(userId: string, event: string, data: unknown) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  sendToProject(projectId: string, event: string, data: unknown) {
    this.server?.to(`project:${projectId}`).emit(event, data);
  }

  sendToIssue(issueId: string, event: string, data: unknown) {
    this.server?.to(`issue:${issueId}`).emit(event, data);
  }
}
