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
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { TypingService } from './typing.service';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ErrorCode } from '@repo/shared/error-codes';
import { z } from 'zod';

interface AuthenticatedSocket extends Socket {
  userId: string;
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
  private readonly logger = new Logger(RealtimeGateway.name);
  private membershipCache = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private membersRepo: ProjectMembersRepository,
    private issuesRepo: IssuesReader,
    private presenceService: PresenceService,
    private typingService: TypingService,
  ) {}

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
      client.userId = payload.sub;

      client.join(`user:${client.userId}`);

      await this.presenceService.setOnline(client.userId);
      this.logger.log(`Client connected: ${client.userId}`);
    } catch (error) {
      this.logger.warn(`WS auth failed: ${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      await this.presenceService.setOffline(client.userId);
      this.logger.log(`Client disconnected: ${client.userId}`);
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

    if (!await this.isProjectMember(client.userId, parsed.data.projectId)) {
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

    const issue = await this.issuesRepo.findIssueRef(parsed.data.issueId);

    if (!issue) {
      throw new WsException(ErrorCode.ISSUE_NOT_FOUND);
    }

    if (!await this.isProjectMember(client.userId, issue.projectId)) {
      throw new WsException(ErrorCode.NOT_PROJECT_MEMBER);
    }

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
