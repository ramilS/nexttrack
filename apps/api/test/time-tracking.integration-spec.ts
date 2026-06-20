import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Time Tracking Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let issueId: string;

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
        name: 'Admin User',
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

    projectKey = 'TT';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Time Tracking Project' })
      .expect(201);

    const issueRes = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Test Issue', type: 'TASK' })
      .expect(201);
    issueId = issueRes.body.data.id;
  });

  function authReq() {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  // ─── Time Logs ──────────────────────────────────────────────

  describe('Time Logs', () => {
    it('should create a manual time log', async () => {
      const res = await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 60 })
        .expect(201);

      expect(res.body.data.duration).toBe(60);
      expect(res.body.data.source).toBe('MANUAL');
      // Logging user is flattened onto the row (not nested under `user`) — the
      // web reads userName/userId/userAvatarUrl directly.
      expect(res.body.data.user).toBeUndefined();
      expect(typeof res.body.data.userId).toBe('string');
      expect(res.body.data.userName).toBe('Admin User');
      expect(res.body.data).toHaveProperty('userAvatarUrl');
    });

    it('should accept period string duration', async () => {
      const res = await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: '2h 30m' })
        .expect(201);

      expect(res.body.data.duration).toBe(150); // 2*60 + 30
    });

    it('should list time logs for an issue', async () => {
      await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 30 })
        .expect(201);
      await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 60 })
        .expect(201);

      const res = await authReq()
        .get(`/issues/${issueId}/time-logs`)
        .expect(200);

      expect(res.body.items.length).toBe(2);
    });

    it('should update a time log', async () => {
      const createRes = await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 30, description: 'old' })
        .expect(201);
      const logId = createRes.body.data.id;

      const updateRes = await authReq()
        .patch(`/issues/${issueId}/time-logs/${logId}`)
        .send({ duration: 60, description: 'updated' })
        .expect(200);

      expect(updateRes.body.data.duration).toBe(60);
      expect(updateRes.body.data.description).toBe('updated');
    });

    it('should soft-delete a time log', async () => {
      const createRes = await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 30 })
        .expect(201);
      const logId = createRes.body.data.id;

      await authReq()
        .delete(`/issues/${issueId}/time-logs/${logId}`)
        .expect(204);

      const dbLog = await ctx.prisma.timeLog.findUnique({ where: { id: logId } });
      expect(dbLog!.deletedAt).not.toBeNull();
    });

    it('should recalculate issue.spent after time log changes', async () => {
      await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 60 })
        .expect(201);
      await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 90 })
        .expect(201);

      const issue = await ctx.prisma.issue.findUnique({ where: { id: issueId } });
      expect(issue!.spent).toBe(150);
    });

    it('should recalculate spent after deleting a log', async () => {
      const log1 = await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 60 })
        .expect(201);
      await authReq()
        .post(`/issues/${issueId}/time-logs`)
        .send({ duration: 90 })
        .expect(201);

      await authReq()
        .delete(`/issues/${issueId}/time-logs/${log1.body.data.id}`)
        .expect(204);

      const issue = await ctx.prisma.issue.findUnique({ where: { id: issueId } });
      expect(issue!.spent).toBe(90);
    });
  });

  // ─── Timer ──────────────────────────────────────────────────

  describe('Active Timer', () => {
    it('should start and get active timer', async () => {
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      const res = await authReq()
        .get('/time-tracking/timer')
        .expect(200);

      expect(res.body.data.issueId).toBe(issueId);
      expect(res.body.data.startedAt).toBeTruthy();
    });

    it('should reject starting a second timer', async () => {
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(409);
    });

    it('should discard a timer without creating a log', async () => {
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      await authReq()
        .post('/time-tracking/timer/discard')
        .expect(204);

      const res = await authReq()
        .get('/time-tracking/timer')
        .expect(200);
      expect(res.body.data).toBeNull();

      // No time log should have been created
      const logs = await ctx.prisma.timeLog.findMany({
        where: { issueId, source: 'TIMER' },
      });
      expect(logs).toHaveLength(0);
    });

    it('should reject stopping when no timer is running', async () => {
      await authReq()
        .post('/time-tracking/timer/stop')
        .send({})
        .expect(400);
    });
  });

  // ─── Multi-User Timer Scenarios ───────────────────────────

  describe('Multi-User Timers', () => {
    let memberToken: string;
    let memberId: string;

    beforeEach(async () => {
      const hash = await bcrypt.hash('Memberpass1!', 4);
      const member = await ctx.prisma.user.create({
        data: {
          email: 'member@test.local',
          name: 'Member',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });
      memberId = member.id;

      const projDb = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      await ctx.prisma.projectMember.create({
        data: {
          userId: memberId,
          projectId: projDb!.id,
          roleId: '00000000-0000-0000-0000-000000000002',
        },
      });

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'member@test.local', password: 'Memberpass1!' })
        .expect(200);
      memberToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);
    });

    function memberReq() {
      return {
        get: (url: string) =>
          request(ctx.app.getHttpServer())
            .get(url)
            .set('Authorization', `Bearer ${memberToken}`),
        post: (url: string) =>
          request(ctx.app.getHttpServer())
            .post(url)
            .set('Authorization', `Bearer ${memberToken}`),
      };
    }

    it('should allow different users to run timers on the same issue', async () => {
      // Admin starts timer
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      // Member also starts timer on same issue
      await memberReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      // Both should see their timers
      const adminTimer = await authReq().get('/time-tracking/timer').expect(200);
      const memberTimer = await memberReq().get('/time-tracking/timer').expect(200);

      expect(adminTimer.body.data.issueId).toBe(issueId);
      expect(memberTimer.body.data.issueId).toBe(issueId);
    });

    it('should reject second timer for the same user on a different issue', async () => {
      // Create second issue
      const issue2Res = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Second Issue', type: 'TASK' })
        .expect(201);

      // Admin starts timer on first issue
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      // Admin tries to start timer on second issue → 409
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId: issue2Res.body.data.id })
        .expect(409);
    });

    it('should stop timer and create time log with TIMER source', async () => {
      await authReq()
        .post('/time-tracking/timer/start')
        .send({ issueId })
        .expect(201);

      // Wait a bit so duration > 0
      await new Promise((r) => setTimeout(r, 1_100));

      await authReq()
        .post('/time-tracking/timer/stop')
        .send({})
        .expect(201);

      // Timer should be cleared
      const timerRes = await authReq().get('/time-tracking/timer').expect(200);
      expect(timerRes.body.data).toBeNull();

      // Time log should exist with TIMER source
      const logs = await ctx.prisma.timeLog.findMany({
        where: { issueId, source: 'TIMER' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].duration).toBeGreaterThanOrEqual(1);
    });
  });
});
