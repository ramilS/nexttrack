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

function tiptapDoc(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

describe('Comments Integration', () => {
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

    projectKey = 'CMT';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Comments Project' })
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

  function commentsUrl() {
    return `/issues/${issueId}/comments`;
  }

  it('should create a comment with Tiptap body', async () => {
    const res = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Hello world') })
      .expect(201);

    expect(res.body.data.body.type).toBe('doc');
    expect(res.body.data.id).toBeTruthy();
  });

  it('should list comments for an issue', async () => {
    await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Comment 1') })
      .expect(201);
    await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Comment 2') })
      .expect(201);

    const res = await authReq().get(commentsUrl()).expect(200);

    expect(res.body.items.length).toBe(2);
  });

  it('should create a reply to a top-level comment', async () => {
    const parentRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Parent comment') })
      .expect(201);
    const parentId = parentRes.body.data.id;

    const replyRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Reply'), parentId })
      .expect(201);

    expect(replyRes.body.data.parentId).toBe(parentId);
  });

  it('should update own comment', async () => {
    const createRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Original') })
      .expect(201);
    const commentId = createRes.body.data.id;

    const updateRes = await authReq()
      .patch(`${commentsUrl()}/${commentId}`)
      .send({ body: tiptapDoc('Updated') })
      .expect(200);

    expect(updateRes.body.data.body.content[0].content[0].text).toBe('Updated');
  });

  it('should soft-delete a comment', async () => {
    const createRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('To delete') })
      .expect(201);
    const commentId = createRes.body.data.id;

    await authReq()
      .delete(`${commentsUrl()}/${commentId}`)
      .expect(204);

    // Comment should be marked as deleted in DB
    const dbComment = await ctx.prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(dbComment!.deletedAt).not.toBeNull();
  });

  it('should exclude deleted comments without replies from the list', async () => {
    const createRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Will vanish') })
      .expect(201);
    const commentId = createRes.body.data.id;

    await authReq().delete(`${commentsUrl()}/${commentId}`).expect(204);

    const listRes = await authReq().get(commentsUrl()).expect(200);
    const ids = listRes.body.items.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(commentId);
  });

  it('should keep a deleted parent as tombstone while it has active replies', async () => {
    const parentRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Parent') })
      .expect(201);
    const parentId = parentRes.body.data.id;

    const replyRes = await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Reply'), parentId })
      .expect(201);
    const replyId = replyRes.body.data.id;

    await authReq().delete(`${commentsUrl()}/${parentId}`).expect(204);

    const listRes = await authReq().get(commentsUrl()).expect(200);
    const parent = listRes.body.items.find(
      (c: { id: string }) => c.id === parentId,
    );
    expect(parent).toBeDefined();
    expect(parent.isDeleted).toBe(true);
    expect(parent.body).toBeNull();
    expect(parent.replies.map((r: { id: string }) => r.id)).toContain(replyId);

    await authReq().delete(`${commentsUrl()}/${replyId}`).expect(204);

    const finalRes = await authReq().get(commentsUrl()).expect(200);
    const finalIds = finalRes.body.items.map((c: { id: string }) => c.id);
    expect(finalIds).not.toContain(parentId);
  });

  it('should reject plain string body (requires Tiptap JSON)', async () => {
    await authReq()
      .post(commentsUrl())
      .send({ body: 'plain text' })
      .expect(400);
  });

  it('should record comment activity', async () => {
    await authReq()
      .post(commentsUrl())
      .send({ body: tiptapDoc('Activity test') })
      .expect(201);

    // Event listener runs async — poll until recorded
    let activities: Awaited<
      ReturnType<typeof ctx.prisma.activity.findMany>
    > = [];
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 200));
      activities = await ctx.prisma.activity.findMany({
        where: { issueId, type: 'COMMENT_ADD' },
      });
      if (activities.length > 0) break;
    }

    expect(activities.length).toBeGreaterThanOrEqual(1);
  });
});
