import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
  E2eContext,
} from './support/create-e2e-app';

interface ExceptionPayload {
  message: string;
}

interface PresenceStatusPayload {
  onlineUsers: string[];
}

interface TypingUpdatePayload {
  userId: string;
  issueId: string;
  isTyping: boolean;
}

describe('Realtime/WebSocket Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  let projectId: string;
  let issueId: string;
  let wsUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    ctx = await createE2eApp({ withWebSockets: true });
    const address = ctx.app.getHttpServer().address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    // Give the server-side handleDisconnect (which awaits Redis) a beat to
    // flush before we close the app and quit Redis. Otherwise the pending
    // presenceService.setOffline call races with client.quit() and ioredis
    // surfaces "Connection is closed" as an unhandled error.
    await new Promise((r) => setTimeout(r, 200));
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    // Allow handleDisconnect (Redis writes) to settle before truncating tables
    await new Promise((r) => setTimeout(r, 100));

    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('adminpass1', 4);
    const admin = await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    const projRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'TEST', name: 'Test Project' })
      .expect(201);
    projectId = projRes.body.data.id;

    const issueRes = await request(ctx.app.getHttpServer())
      .post('/projects/TEST/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Issue', type: 'TASK', priority: 'MEDIUM' })
      .expect(201);
    issueId = issueRes.body.data.id;
  });

  function connectClient(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = io(wsUrl, {
        path: '/realtime',
        transports: ['websocket'],
        auth: token ? { token } : undefined,
        reconnection: false,
      });
      clients.push(client);
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5_000);
      client.on('connect', () => {
        clearTimeout(timeout);
        resolve(client);
      });
      client.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  function waitForDisconnect(client: ClientSocket): Promise<void> {
    return new Promise((resolve) => {
      if (!client.connected) { resolve(); return; }
      client.on('disconnect', () => resolve());
      setTimeout(() => resolve(), 3_000);
    });
  }

  function waitForEvent<T = unknown>(client: ClientSocket, event: string, timeoutMs = 5_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${event}`)), timeoutMs);
      client.once(event, (data: T) => { clearTimeout(timer); resolve(data); });
    });
  }

  async function createMemberAndLogin(email: string, password: string) {
    const hash = await bcrypt.hash(password, 4);
    const user = await ctx.prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: hash, hasPassword: true, role: 'USER' },
    });
    await ctx.prisma.projectMember.create({
      data: { userId: user.id, projectId, roleId: '00000000-0000-0000-0000-000000000002' },
    });
    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return { user, token: extractAccessTokenFromCookies(loginRes.headers["set-cookie"]) };
  }

  // ─── Connection & Auth ────────────────────────────────────

  describe('Connection & Auth', () => {
    it('should connect with valid JWT', async () => {
      const client = await connectClient(adminToken);
      expect(client.connected).toBe(true);
    });

    it('should disconnect without token', async () => {
      const client = io(wsUrl, {
        path: '/realtime',
        transports: ['websocket'],
        auth: {},
        reconnection: false,
      });
      clients.push(client);
      await waitForDisconnect(client);
      expect(client.connected).toBe(false);
    });

    it('should disconnect with invalid token', async () => {
      const client = io(wsUrl, {
        path: '/realtime',
        transports: ['websocket'],
        auth: { token: 'invalid-jwt-token' },
        reconnection: false,
      });
      clients.push(client);
      await waitForDisconnect(client);
      expect(client.connected).toBe(false);
    });
  });

  // ─── Room Management ──────────────────────────────────────

  describe('Room Management', () => {
    it('should join project room when member', async () => {
      const client = await connectClient(adminToken);
      client.emit('join:project', { projectId });
      await new Promise((r) => setTimeout(r, 300));
      expect(client.connected).toBe(true);
    });

    it('should reject join project room when not member', async () => {
      const hash = await bcrypt.hash('Outsider1pass!', 4);
      await ctx.prisma.user.create({
        data: { email: 'outsider@test.local', name: 'Outsider', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'outsider@test.local', password: 'Outsider1pass!' })
        .expect(200);

      const client = await connectClient(extractAccessTokenFromCookies(loginRes.headers["set-cookie"]));

      const error = await new Promise<ExceptionPayload | null>((resolve) => {
        client.on('exception', (data: ExceptionPayload) => resolve(data));
        client.emit('join:project', { projectId });
        setTimeout(() => resolve(null), 2_000);
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('NOT_PROJECT_MEMBER');
    });

    it('should join issue room when member of issue project', async () => {
      const client = await connectClient(adminToken);
      client.emit('join:issue', { issueId });
      await new Promise((r) => setTimeout(r, 300));
      expect(client.connected).toBe(true);
    });
  });

  // ─── Presence ─────────────────────────────────────────────

  describe('Presence', () => {
    it('should report user as online after connection', async () => {
      const client = await connectClient(adminToken);
      await new Promise((r) => setTimeout(r, 300));

      const presenceData = await new Promise<PresenceStatusPayload>((resolve) => {
        client.on('presence:status', (data) => resolve(data));
        client.emit('presence:check', { userIds: [adminId] });
      });

      expect(presenceData.onlineUsers).toContain(adminId);
    });

    it('should report user as offline after disconnect', async () => {
      const client1 = await connectClient(adminToken);
      client1.disconnect();
      await new Promise((r) => setTimeout(r, 500));

      const { token: checkerToken } = await createMemberAndLogin('checker@test.local', 'Checker1pass!');
      const client2 = await connectClient(checkerToken);
      await new Promise((r) => setTimeout(r, 300));

      const presenceData = await new Promise<PresenceStatusPayload>((resolve) => {
        client2.on('presence:status', (data) => resolve(data));
        client2.emit('presence:check', { userIds: [adminId] });
      });

      expect(presenceData.onlineUsers).not.toContain(adminId);
    });
  });

  // ─── Typing Indicators ────────────────────────────────────

  describe('Typing Indicators', () => {
    it('should broadcast typing:start to other clients in issue room', async () => {
      const { token: memberToken } = await createMemberAndLogin('member@test.local', 'Member1pass!');

      const clientA = await connectClient(adminToken);
      const clientB = await connectClient(memberToken);

      clientA.emit('join:issue', { issueId });
      clientB.emit('join:issue', { issueId });
      await new Promise((r) => setTimeout(r, 500));

      const typingPromise = waitForEvent<TypingUpdatePayload>(clientB, 'typing:update');
      clientA.emit('typing:start', { issueId });

      const data = await typingPromise;
      expect(data.userId).toBe(adminId);
      expect(data.issueId).toBe(issueId);
      expect(data.isTyping).toBe(true);
    });

    it('should broadcast typing:stop to other clients in issue room', async () => {
      const { token: memberToken } = await createMemberAndLogin('member2@test.local', 'Member2pass!');

      const clientA = await connectClient(adminToken);
      const clientB = await connectClient(memberToken);

      clientA.emit('join:issue', { issueId });
      clientB.emit('join:issue', { issueId });
      await new Promise((r) => setTimeout(r, 500));

      const typingPromise = waitForEvent<TypingUpdatePayload>(clientB, 'typing:update');
      clientA.emit('typing:stop', { issueId });

      const data = await typingPromise;
      expect(data.isTyping).toBe(false);
    });

    it('should reject typing from a non-member of the issue project', async () => {
      const hash = await bcrypt.hash('Outsider2pass!', 4);
      await ctx.prisma.user.create({
        data: { email: 'outsider2@test.local', name: 'O2', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'outsider2@test.local', password: 'Outsider2pass!' })
        .expect(200);
      const client = await connectClient(extractAccessTokenFromCookies(loginRes.headers["set-cookie"]));

      const error = await new Promise<ExceptionPayload | null>((resolve) => {
        client.on('exception', (data: ExceptionPayload) => resolve(data));
        client.emit('typing:start', { issueId });
        setTimeout(() => resolve(null), 2_000);
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('NOT_PROJECT_MEMBER');
    });
  });

  // ─── Connection auth (regression) ─────────────────────────
  describe('Connection auth', () => {
    it('should disconnect a blocked user even with a valid token', async () => {
      const { user, token } = await createMemberAndLogin('toblock@test.local', 'ToBlock1pass!');
      // Block the user AFTER obtaining a still-valid access token.
      await ctx.prisma.user.update({ where: { id: user.id }, data: { isBlocked: true } });

      const client = io(wsUrl, {
        path: '/realtime',
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });
      clients.push(client);
      await new Promise((r) => setTimeout(r, 700));

      expect(client.connected).toBe(false);
    });
  });
});
