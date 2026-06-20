import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { ALL_PERMISSIONS, Permission } from '@repo/shared';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
} from './support/create-e2e-app';

/**
 * Authorization integration tests for project-level access control.
 *
 * Verifies that authenticated users who are NOT members of a project
 * receive 403 Forbidden when accessing that project's resources,
 * while actual project members succeed.
 */
describe('Project-Level Authorization (full AppModule)', () => {
  let ctx: E2eContext;

  let adminToken: string;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;

  let alphaProjectId: string;
  let alphaIssueId: string;
  let alphaBoardId: string;
  let alphaTagId: string;

  const ROLE_IDS = {
    PROJECT_ADMIN: '00000000-0000-0000-0000-000000000001',
    DEVELOPER: '00000000-0000-0000-0000-000000000002',
  };

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);

    // --- Seed system roles ---
    await ctx.prisma.role.createMany({
      data: [
        {
          id: ROLE_IDS.PROJECT_ADMIN,
          name: 'Project Admin',
          description: 'Full access',
          permissions: ALL_PERMISSIONS as Prisma.InputJsonValue,
          isSystem: true,
        },
        {
          id: ROLE_IDS.DEVELOPER,
          name: 'Developer',
          description: 'Developer access',
          permissions: [
            Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE,
            Permission.ISSUE_DELETE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE,
            Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
            Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE,
            Permission.TAG_MANAGE, Permission.BOARD_MANAGE,
            Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN,
          ] as Prisma.InputJsonValue,
          isSystem: true,
        },
      ],
    });

    // --- Seed users ---
    const hash = await bcrypt.hash('password1', 4);

    await ctx.prisma.user.create({
      data: { email: 'admin@test.local', name: 'Admin', passwordHash: hash, hasPassword: true, role: 'ADMIN' },
    });

    const userA = await ctx.prisma.user.create({
      data: { email: 'usera@test.local', name: 'User A', passwordHash: hash, hasPassword: true, role: 'USER' },
    });
    userAId = userA.id;

    const userB = await ctx.prisma.user.create({
      data: { email: 'userb@test.local', name: 'User B', passwordHash: hash, hasPassword: true, role: 'USER' },
    });
    userBId = userB.id;

    // --- Login all users ---
    const [adminLogin, userALogin, userBLogin] = await Promise.all([
      request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'admin@test.local', password: 'password1' }),
      request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'usera@test.local', password: 'password1' }),
      request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'userb@test.local', password: 'password1' }),
    ]);
    adminToken = extractAccessTokenFromCookies(adminLogin.headers["set-cookie"]);
    userAToken = extractAccessTokenFromCookies(userALogin.headers["set-cookie"]);
    userBToken = extractAccessTokenFromCookies(userBLogin.headers["set-cookie"]);

    // --- Create Project Alpha via API (admin is auto-added as Project Admin) ---
    const alphaRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'ALPHA', name: 'Project Alpha' })
      .expect(201);
    alphaProjectId = alphaRes.body.data.id;

    // --- Add User A as Developer in Project Alpha (via Prisma — faster & reliable) ---
    await ctx.prisma.projectMember.create({
      data: { userId: userAId, projectId: alphaProjectId, roleId: ROLE_IDS.DEVELOPER },
    });

    // --- Create Project Beta and add User B (User B has a project, just not Alpha) ---
    const betaRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'BETA', name: 'Project Beta' })
      .expect(201);
    await ctx.prisma.projectMember.create({
      data: { userId: userBId, projectId: betaRes.body.data.id, roleId: ROLE_IDS.DEVELOPER },
    });

    // --- Create issue in Project Alpha ---
    const issueRes = await request(ctx.app.getHttpServer())
      .post('/projects/ALPHA/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Alpha Issue', type: 'TASK', priority: 'MEDIUM' })
      .expect(201);
    alphaIssueId = issueRes.body.data.id;

    // --- Create tag in Project Alpha ---
    const tagRes = await request(ctx.app.getHttpServer())
      .post('/projects/ALPHA/tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(201);
    alphaTagId = tagRes.body.data.id;

    // --- Create a SCRUM board in Project Alpha ---
    const boardRes = await request(ctx.app.getHttpServer())
      .post('/projects/ALPHA/boards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alpha Sprint Board', type: 'SCRUM' })
      .expect(201);
    alphaBoardId = boardRes.body.data.id;
  });

  // ── Helpers ──

  function reqAs(token: string) {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. IssueTagsController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('IssueTagsController — /issues/:issueId/tags', () => {
    it('User B (non-member) POST → 403', async () => {
      await reqAs(userBToken)
        .post(`/issues/${alphaIssueId}/tags`)
        .send({ tagId: alphaTagId })
        .expect(403);
    });

    it('User B (non-member) DELETE → 403', async () => {
      await reqAs(userBToken)
        .delete(`/issues/${alphaIssueId}/tags/${alphaTagId}`)
        .expect(403);
    });

    it('User A (member, TAG_MANAGE) POST → success', async () => {
      const res = await reqAs(userAToken)
        .post(`/issues/${alphaIssueId}/tags`)
        .send({ tagId: alphaTagId });

      expect(res.status).toBe(200);
    });

    it('User A (member, TAG_MANAGE) DELETE → 204', async () => {
      // First add the tag
      await reqAs(userAToken)
        .post(`/issues/${alphaIssueId}/tags`)
        .send({ tagId: alphaTagId });

      await reqAs(userAToken)
        .delete(`/issues/${alphaIssueId}/tags/${alphaTagId}`)
        .expect(204);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. CommentsController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('CommentsController — /issues/:issueId/comments', () => {
    it('User B GET → 403', async () => {
      await reqAs(userBToken)
        .get(`/issues/${alphaIssueId}/comments`)
        .expect(403);
    });

    it('User B POST → 403', async () => {
      await reqAs(userBToken)
        .post(`/issues/${alphaIssueId}/comments`)
        .send({ body: 'sneaky comment' })
        .expect(403);
    });

    it('User A (ISSUE_READ) GET → 200', async () => {
      await reqAs(userAToken)
        .get(`/issues/${alphaIssueId}/comments`)
        .expect(200);
    });

    it('User A (COMMENT_CREATE) POST → 201', async () => {
      const res = await reqAs(userAToken)
        .post(`/issues/${alphaIssueId}/comments`)
        .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'legitimate comment' }] }] } });

      expect(res.status).toBe(201);
    });

    it('User B PATCH existing comment → 403', async () => {
      const commentRes = await reqAs(adminToken)
        .post(`/issues/${alphaIssueId}/comments`)
        .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'admin comment' }] }] } });
      const commentId = commentRes.body.data.id;

      await reqAs(userBToken)
        .patch(`/issues/${alphaIssueId}/comments/${commentId}`)
        .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hacked' }] }] } })
        .expect(403);
    });

    it('User B DELETE existing comment → 403', async () => {
      const commentRes = await reqAs(adminToken)
        .post(`/issues/${alphaIssueId}/comments`)
        .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'admin comment' }] }] } });
      const commentId = commentRes.body.data.id;

      await reqAs(userBToken)
        .delete(`/issues/${alphaIssueId}/comments/${commentId}`)
        .expect(403);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. AttachmentsController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('AttachmentsController — /issues/:issueId/attachments', () => {
    it('User B GET (list) → 403', async () => {
      await reqAs(userBToken)
        .get(`/issues/${alphaIssueId}/attachments`)
        .expect(403);
    });

    it('User B POST (upload) → 403', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/issues/${alphaIssueId}/attachments`)
        .set('Authorization', `Bearer ${userBToken}`)
        .attach('files', Buffer.from('test'), 'test.txt')
        .expect(403);
    });

    it('User A GET (list) → 200', async () => {
      await reqAs(userAToken)
        .get(`/issues/${alphaIssueId}/attachments`)
        .expect(200);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. SprintsController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('SprintsController — /boards/:boardId/sprints', () => {
    it('User B GET → 403', async () => {
      await reqAs(userBToken)
        .get(`/boards/${alphaBoardId}/sprints`)
        .expect(403);
    });

    it('User B POST → 403', async () => {
      await reqAs(userBToken)
        .post(`/boards/${alphaBoardId}/sprints`)
        .send({ name: 'Sneaky Sprint' })
        .expect(403);
    });

    it('User A GET (ISSUE_READ) → 200', async () => {
      await reqAs(userAToken)
        .get(`/boards/${alphaBoardId}/sprints`)
        .expect(200);
    });

    it('User A POST (SPRINT_MANAGE) → 201', async () => {
      const res = await reqAs(userAToken)
        .post(`/boards/${alphaBoardId}/sprints`)
        .send({ name: 'Sprint 1' });

      expect(res.status).toBe(201);
    });

    it('User B DELETE sprint → 403', async () => {
      const sprintRes = await reqAs(adminToken)
        .post(`/boards/${alphaBoardId}/sprints`)
        .send({ name: 'Sprint To Delete' });
      const sprintId = sprintRes.body.data.id;

      await reqAs(userBToken)
        .delete(`/boards/${alphaBoardId}/sprints/${sprintId}`)
        .expect(403);
    });

    it('User B POST /:sprintId/start → 403', async () => {
      const sprintRes = await reqAs(adminToken)
        .post(`/boards/${alphaBoardId}/sprints`)
        .send({ name: 'Sprint To Start' });
      const sprintId = sprintRes.body.data.id;

      await reqAs(userBToken)
        .post(`/boards/${alphaBoardId}/sprints/${sprintId}/start`)
        .send({ startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 86400000).toISOString() })
        .expect(403);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. FieldValuesController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('FieldValuesController — /issues/:issueId/fields', () => {
    it('User B GET → 403', async () => {
      await reqAs(userBToken)
        .get(`/issues/${alphaIssueId}/fields`)
        .expect(403);
    });

    it('User A GET (ISSUE_READ) → 200', async () => {
      await reqAs(userAToken)
        .get(`/issues/${alphaIssueId}/fields`)
        .expect(200);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. TimeLogsController
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('TimeLogsController — /issues/:issueId/time-logs', () => {
    it('User B GET → 403', async () => {
      await reqAs(userBToken)
        .get(`/issues/${alphaIssueId}/time-logs`)
        .expect(403);
    });

    it('User B POST → 403', async () => {
      await reqAs(userBToken)
        .post(`/issues/${alphaIssueId}/time-logs`)
        .send({ duration: 30, description: 'sneaky' })
        .expect(403);
    });

    it('User A GET (ISSUE_READ) → 200', async () => {
      await reqAs(userAToken)
        .get(`/issues/${alphaIssueId}/time-logs`)
        .expect(200);
    });

    it('User A POST (TIME_LOG_OWN) → 201', async () => {
      const res = await reqAs(userAToken)
        .post(`/issues/${alphaIssueId}/time-logs`)
        .send({ duration: 60, description: 'worked on it' });

      expect(res.status).toBe(201);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. TimerController — service-level membership check
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('TimerController — /time-tracking/timer', () => {
    it('User B POST /start with Alpha issue → 403', async () => {
      await reqAs(userBToken)
        .post('/time-tracking/timer/start')
        .send({ issueId: alphaIssueId })
        .expect(403);
    });

    it('User A POST /start with Alpha issue → success', async () => {
      const res = await reqAs(userAToken)
        .post('/time-tracking/timer/start')
        .send({ issueId: alphaIssueId });

      expect(res.status).toBe(201);
      expect(res.body.data.issueId).toBe(alphaIssueId);

      // Cleanup — discard the timer
      await reqAs(userAToken).post('/time-tracking/timer/discard');
    });

    it('User A GET /timer returns own timer (user-scoped, safe)', async () => {
      await reqAs(userAToken)
        .get('/time-tracking/timer')
        .expect(200);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. Management permission matrix — member LACKING the
  //    permission must get 403 on the guarded mutating route.
  //
  //    User A is a Developer in Project Alpha: a real member,
  //    so this isolates the per-permission check (not membership).
  //    The Developer role holds NONE of these 11 MANAGE perms.
  //    Guards run before handlers, so route-valid (possibly
  //    non-existent) resource ids are sufficient to assert 403.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // A syntactically valid UUID that does not need to resolve —
  // the permission guard rejects before the handler looks it up.
  const ROUTE_VALID_ID = '00000000-0000-0000-0000-0000000000ff';

  describe('Management permission matrix (member lacking permission → 403)', () => {
    describe('WebhooksController — WEBHOOK_MANAGE', () => {
      it('User A POST /projects/:key/webhooks → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/webhooks')
          .send({ url: 'https://example.com/hook', events: ['issue.created'] })
          .expect(403);
      });
    });

    describe('TelegramController — WEBHOOK_MANAGE', () => {
      it('User A POST /projects/:key/telegram → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/telegram')
          .send({ botToken: '123:abc', chatId: '42' })
          .expect(403);
      });
    });

    describe('CustomFieldsController — CUSTOM_FIELD_MANAGE', () => {
      it('User A POST /projects/:key/custom-fields → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/custom-fields')
          .send({ name: 'Severity', type: 'TEXT' })
          .expect(403);
      });
    });

    describe('WorkflowsController — WORKFLOW_MANAGE', () => {
      it('User A POST /projects/:key/workflows → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/workflows')
          .send({ name: 'Sneaky Workflow' })
          .expect(403);
      });
    });

    describe('WorkflowAutomationController — WORKFLOW_RULE_MANAGE', () => {
      it('User A POST /projects/:key/workflow-rules → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/workflow-rules')
          .send({ name: 'Sneaky Rule' })
          .expect(403);
      });
    });

    describe('VersionsController — VERSION_MANAGE', () => {
      it('User A POST /projects/:key/versions → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/versions')
          .send({ name: '1.0.0' })
          .expect(403);
      });
    });

    describe('TeamsController — TEAM_MANAGE', () => {
      it('User A POST /projects/:key/teams → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/teams')
          .send({ name: 'Sneaky Team' })
          .expect(403);
      });
    });

    describe('AutoAssignController — AUTO_ASSIGN_MANAGE', () => {
      it('User A POST /projects/:key/auto-assign → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/auto-assign')
          .send({ name: 'Sneaky Auto-Assign', assigneeId: userAId })
          .expect(403);
      });
    });

    describe('ProjectsController — MEMBER_MANAGE', () => {
      it('User A POST /projects/:key/members → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/members')
          .send({ userId: userBId, roleId: ROLE_IDS.DEVELOPER })
          .expect(403);
      });
    });

    describe('ProjectsController — PROJECT_SETTINGS_UPDATE', () => {
      it('User A PATCH /projects/:key → 403', async () => {
        await reqAs(userAToken)
          .patch('/projects/ALPHA')
          .send({ name: 'Hijacked Name' })
          .expect(403);
      });
    });

    describe('ProjectsController — PROJECT_ARCHIVE', () => {
      it('User A POST /projects/:key/archive → 403', async () => {
        await reqAs(userAToken)
          .post('/projects/ALPHA/archive')
          .expect(403);
      });
    });

    describe('KnowledgeBaseController — ARTICLE_DELETE', () => {
      it('User A DELETE /projects/:key/articles/:id → 403', async () => {
        // Developer HAS ARTICLE_UPDATE but NOT ARTICLE_DELETE — this
        // isolates the delete permission specifically.
        await reqAs(userAToken)
          .delete(`/projects/ALPHA/articles/${ROUTE_VALID_ID}`)
          .expect(403);
      });
    });
  });
});
