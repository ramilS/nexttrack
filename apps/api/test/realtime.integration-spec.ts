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

// `join:issue` has no ack, and two sockets' async handlers can complete in
// either order, so there is nothing to await before a broadcast is expected to
// reach the other client. This is the one place a fixed wait is the right tool.
const ROOM_JOIN_SETTLE_MS = 500;

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

  /**
   * Asserts the server did NOT reject the last emit. A guard rejection arrives
   * as an `exception` event, so the only way to observe its absence is to give
   * the server a window to send one — the mirror of the NOT_PROJECT_MEMBER
   * tests below, which is what makes the "allowed" case meaningful.
   */
  async function expectNoException(
    client: ClientSocket,
    windowMs = 500,
  ): Promise<void> {
    const exception = await new Promise<ExceptionPayload | null>((resolve) => {
      client.once('exception', (data: ExceptionPayload) => resolve(data));
      setTimeout(() => resolve(null), windowMs);
    });
    expect(exception).toBeNull();
    expect(client.connected).toBe(true);
  }

  /** One `presence:check` round trip. */
  async function isOnline(client: ClientSocket, userId: string): Promise<boolean> {
    const data = await new Promise<PresenceStatusPayload>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for: presence:status')),
        2_000,
      );
      client.once('presence:status', (payload: PresenceStatusPayload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.emit('presence:check', { userIds: [userId] });
    });
    return data.onlineUsers.includes(userId);
  }

  /**
   * Presence is written to Redis by the connect/disconnect handlers, which the
   * client cannot await. Polling the real `presence:check` round trip returns as
   * soon as the write lands instead of after a guessed sleep, and fails with a
   * useful message if it never does.
   */
  async function waitForPresence(
    client: ClientSocket,
    userId: string,
    online: boolean,
    timeoutMs = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((await isOnline(client, userId)) === online) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `user ${userId} never became ${online ? 'online' : 'offline'} within ${timeoutMs}ms`,
        );
      }
      await new Promise((r) => setTimeout(r, 25));
    }
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
      await expectNoException(client);
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

      expect(error?.message).toContain('NOT_PROJECT_MEMBER');
    });

    it('should join issue room when member of issue project', async () => {
      const client = await connectClient(adminToken);
      client.emit('join:issue', { issueId });
      await expectNoException(client);
    });
  });

  // ─── Presence ─────────────────────────────────────────────

  describe('Presence', () => {
    it('should report user as online after connection', async () => {
      const client = await connectClient(adminToken);

      await waitForPresence(client, adminId, true);
      expect(await isOnline(client, adminId)).toBe(true);
    });

    it('should report user as offline after disconnect', async () => {
      const admin = await connectClient(adminToken);
      const { token: checkerToken } = await createMemberAndLogin('checker@test.local', 'Checker1pass!');
      const checker = await connectClient(checkerToken);

      // Assert the transition, not just the end state: an always-offline bug
      // would otherwise pass this test.
      await waitForPresence(checker, adminId, true);

      admin.disconnect();

      await waitForPresence(checker, adminId, false);
      expect(await isOnline(checker, adminId)).toBe(false);
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
      await new Promise((r) => setTimeout(r, ROOM_JOIN_SETTLE_MS));

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
      await new Promise((r) => setTimeout(r, ROOM_JOIN_SETTLE_MS));

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

      expect(error?.message).toContain('NOT_PROJECT_MEMBER');
    });
  });

  // ─── Domain-event broadcasts ──────────────────────────────

  /**
   * The seam nothing covered before: a mutation over HTTP has to reach an open
   * client's project room. Every layer had a green test of its own — the
   * gateway, the dispatch service, the web hook against a mocked socket — while
   * the wiring between them did not exist, so no event was ever emitted.
   */
  describe('Domain-event broadcasts', () => {
    interface BroadcastPayload {
      payload: { issueId: string };
      actorId: string;
    }

    async function joinedProjectClient(): Promise<ClientSocket> {
      // Drain the fixture's own events (beforeEach creates a project and an
      // issue) BEFORE joining, or the first `issue:created` a test observes is
      // the fixture's rather than the one it just made.
      await ctx.settle();

      const client = await connectClient(adminToken);
      client.emit('join:project', { projectId });
      // Doubles as the barrier: the window that proves the join was not
      // rejected is also the window in which the server processes it.
      await expectNoException(client);
      return client;
    }

    it('pushes issue:created to the project room', async () => {
      const client = await joinedProjectClient();
      const received = waitForEvent<BroadcastPayload>(client, 'issue:created');

      const created = await request(ctx.app.getHttpServer())
        .post('/projects/TEST/issues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Broadcast me' })
        .expect(201);

      await ctx.settle();

      const event = await received;
      expect(event.payload.issueId).toBe(created.body.data.id);
      expect(event.actorId).toBe(adminId);
    });

    it('pushes issue:updated to the project room', async () => {
      const client = await joinedProjectClient();
      const received = waitForEvent<BroadcastPayload>(client, 'issue:updated');

      await request(ctx.app.getHttpServer())
        .patch('/projects/TEST/issues/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Renamed' })
        .expect(200);

      await ctx.settle();

      const event = await received;
      expect(event.payload.issueId).toBe(issueId);
    });

    it('pushes comment:created carrying the issue the comment belongs to', async () => {
      const client = await joinedProjectClient();
      const received = waitForEvent<BroadcastPayload>(client, 'comment:created');

      await request(ctx.app.getHttpServer())
        .post(`/issues/${issueId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
            ],
          },
        })
        .expect(201);

      await ctx.settle();

      const event = await received;
      expect(event.payload.issueId).toBe(issueId);
    });

    it('does not push a project\'s events to a non-member', async () => {
      const hash = await bcrypt.hash('Outsider3pass!', 4);
      await ctx.prisma.user.create({
        data: { email: 'outsider3@test.local', name: 'O3', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'outsider3@test.local', password: 'Outsider3pass!' })
        .expect(200);
      const outsider = await connectClient(
        extractAccessTokenFromCookies(loginRes.headers['set-cookie']),
      );

      // The join is rejected, so the outsider never enters the room.
      const rejection = new Promise<ExceptionPayload | null>((resolve) => {
        outsider.once('exception', (data: ExceptionPayload) => resolve(data));
        outsider.emit('join:project', { projectId });
        setTimeout(() => resolve(null), 2_000);
      });
      expect((await rejection)?.message).toContain('NOT_PROJECT_MEMBER');

      let leaked: unknown = null;
      outsider.once('issue:created', (data: unknown) => {
        leaked = data;
      });

      await request(ctx.app.getHttpServer())
        .post('/projects/TEST/issues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Members only' })
        .expect(201);

      await ctx.settle();
      await new Promise((r) => setTimeout(r, ROOM_JOIN_SETTLE_MS));

      expect(leaked).toBeNull();
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

      // Fails loudly if the server neither rejects the handshake nor drops the
      // socket — a fixed sleep here would pass even if nothing happened at all.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('blocked user was neither rejected nor disconnected')),
          5_000,
        );
        const settled = () => {
          clearTimeout(timer);
          resolve();
        };
        client.on('connect_error', settled);
        client.on('disconnect', settled);
      });

      expect(client.connected).toBe(false);
    });
  });
});
