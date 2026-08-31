import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DeliveryChannel, NotificationType, OutboxStatus } from '@prisma/client';
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

  /**
   * Settles the event pipeline, then reads the outbox. After `settle()` the
   * INTERNAL rows have been delivered and marked PROCESSED, while EMAIL /
   * WEBHOOK / TELEGRAM rows stay PENDING because their processors are mocked.
   */
  async function settledOutboxEvents(channel?: DeliveryChannel) {
    await ctx.settle();
    return ctx.prisma.outboxEvent.findMany({
      where: channel ? { channel } : {},
    });
  }

  it('dispatches the internal events and leaves the outbound ones queued', async () => {
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

    const events = await settledOutboxEvents();

    // A listener that throws lands here — the row would be FAILED with its error.
    expect(events.filter((e) => e.status === OutboxStatus.FAILED)).toEqual([]);

    const internal = events.filter((e) => e.channel === DeliveryChannel.INTERNAL);
    expect(internal.length).toBeGreaterThan(0);
    expect(
      internal.every((e) => e.status === OutboxStatus.PROCESSED),
    ).toBe(true);

    // The email/webhook processors are mocked, so their rows stay queued.
    const outbound = events.filter((e) => e.channel !== DeliveryChannel.INTERNAL);
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.every((e) => e.status === OutboxStatus.PENDING)).toBe(true);
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

    const events = await settledOutboxEvents();
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(event.aggregateType).toBeTruthy();
      expect(event.aggregateId).toBeTruthy();
      expect(event.eventType).toBeTruthy();
      expect(event.channel).toBeTruthy();
      expect(event.maxAttempts).toBeGreaterThanOrEqual(1);
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

    const webhookEvents = await settledOutboxEvents(DeliveryChannel.WEBHOOK);
    expect(webhookEvents.map((e) => e.eventType)).toEqual(['ASSIGNEE_CHANGED']);
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

    await ctx.settle();

    const notifications = await ctx.prisma.notification.findMany({
      where: { userId: memberId },
    });
    expect(notifications.map((n) => n.type)).toContain(
      NotificationType.ISSUE_ASSIGNED,
    );
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

    const events = await settledOutboxEvents();
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(event.maxAttempts).toBe(5);
      // `attempts` counts delivery attempts by the (mocked) processors; the
      // internal rows this harness dispatches never go through that counter.
      expect(event.attempts).toBe(0);
    }
  });
});
