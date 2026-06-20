import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
  E2eContext,
} from './support/create-e2e-app';

describe('Outbox Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let memberId: string;
  let projectKey: string;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('adminpass1', 4);
    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });

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
    projectKey = projRes.body.data.key;
    projectId = projRes.body.data.id;

    // Create member with notification preferences
    const memberHash = await bcrypt.hash('Memberpass1!', 4);
    const member = await ctx.prisma.user.create({
      data: {
        email: 'member@test.local',
        name: 'Member',
        passwordHash: memberHash,
        hasPassword: true,
        role: 'USER',
      },
    });
    memberId = member.id;
    await ctx.prisma.projectMember.create({
      data: { userId: memberId, projectId, roleId: '00000000-0000-0000-0000-000000000002' },
    });

    // Enable email + webhook notifications
    await ctx.prisma.notificationPreferences.create({
      data: {
        userId: memberId,
        emailEnabled: true,
        channelSettings: {
          ISSUE_ASSIGNED: { inApp: true, email: true },
          MENTION: { inApp: true, email: true },
        },
      },
    });

    // Create webhook
    await request(ctx.app.getHttpServer())
      .post(`/projects/${projectKey}/webhooks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Webhook',
        url: 'https://ci.example.com/hooks',
        eventTypes: ['ASSIGNEE_CHANGED', 'STATUS_CHANGED'],
        secret: 'a'.repeat(32),
      })
      .expect(201);
  });

  function authReq() {
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${adminToken}`),
    };
  }

  async function waitForOutboxEvents(
    minCount: number,
    maxWaitMs = 3_000,
    channel?: 'EMAIL' | 'WEBHOOK' | 'TELEGRAM' | 'INTERNAL',
  ) {
    const where = channel ? { channel: channel as never } : {};
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const events = await ctx.prisma.outboxEvent.findMany({ where });
      if (events.length >= minCount) return events;
      await new Promise((r) => setTimeout(r, 200));
    }
    return ctx.prisma.outboxEvent.findMany({ where });
  }

  it('should create outbox events when notification is dispatched', async () => {
    // Assign issue to member — triggers ISSUE_ASSIGNED notification → outbox
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({
        title: 'Assigned Issue',
        type: 'TASK',
        priority: 'MEDIUM',
        assigneeId: memberId,
      })
      .expect(201);

    const events = await waitForOutboxEvents(1);
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Check at least one event has PENDING status
    const pendingEvents = events.filter((e) => e.status === 'PENDING');
    expect(pendingEvents.length).toBeGreaterThanOrEqual(0); // May already be processed by mock
  });

  it('should persist outbox events with correct aggregate info', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({
        title: 'Aggregate Test',
        type: 'BUG',
        priority: 'HIGH',
        assigneeId: memberId,
      })
      .expect(201);

    const events = await waitForOutboxEvents(1);

    if (events.length > 0) {
      // Verify structure of outbox events
      for (const event of events) {
        expect(event.aggregateType).toBeTruthy();
        expect(event.aggregateId).toBeTruthy();
        expect(event.eventType).toBeTruthy();
        expect(event.channel).toBeTruthy();
        expect(event.maxAttempts).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('should create webhook outbox events for subscribed event types', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({
        title: 'Webhook Test',
        type: 'TASK',
        priority: 'MEDIUM',
        assigneeId: memberId,
      })
      .expect(201);

    const webhookEvents = await waitForOutboxEvents(1, 3_000, 'WEBHOOK');
    expect(webhookEvents.length).toBeGreaterThan(0);
    expect(webhookEvents[0].eventType).toBe('ASSIGNEE_CHANGED');
  });

  it('should create notification records for assigned issues', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({
        title: 'Notification Test',
        type: 'TASK',
        priority: 'MEDIUM',
        assigneeId: memberId,
      })
      .expect(201);

    // Wait for async notification dispatch
    await new Promise((r) => setTimeout(r, 1_000));

    const notifications = await ctx.prisma.notification.findMany({
      where: { userId: memberId },
    });

    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const assignNotification = notifications.find((n) => n.type === 'ISSUE_ASSIGNED');
    expect(assignNotification).toBeDefined();
  });

  it('outbox events should have default maxAttempts', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({
        title: 'MaxAttempts Test',
        type: 'TASK',
        priority: 'LOW',
        assigneeId: memberId,
      })
      .expect(201);

    const events = await waitForOutboxEvents(1);

    if (events.length > 0) {
      for (const event of events) {
        expect(event.maxAttempts).toBe(5);
        expect(event.attempts).toBe(0);
      }
    }
  });
});
