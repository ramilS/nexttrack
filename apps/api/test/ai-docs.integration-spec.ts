import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { Job } from 'bullmq';
import type { TiptapDoc } from '@repo/shared/schemas';
import { STRUCTURED_LLM } from '@/modules/ai-docs/llm/structured-llm';
import { DocGenerationProcessor } from '@/modules/ai-docs/doc-generation.processor';
import type { DocGenJobData } from '@/modules/ai-docs/ai-docs.constants';
import { canonicalTiptapHash } from '@/modules/ai-docs/canonical-hash';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

// Read at module init by aiDocsConfig — must be set before createE2eApp() compiles AppModule.
process.env.AI_DOCS_ENABLED = 'true';
process.env.AI_DOCS_API_KEY = 'test-key';
process.env.AI_DOCS_REJECTION_STATUS_NAMES = "Won't Fix";

const DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};

// Mutated per-test; the provider holds this same reference for the suite's lifetime.
const llmStub: {
  suggestion: unknown;
  merge: unknown;
  generate: (req: { schemaName: string }) => Promise<unknown>;
} = {
  suggestion: null,
  merge: null,
  generate: async (req) =>
    req.schemaName === 'doc_merge' ? llmStub.merge : llmStub.suggestion,
};

describe('AI Docs Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  const projectKey = 'AID';

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (b) => b.overrideProvider(STRUCTURED_LLM).useValue(llmStub),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    llmStub.suggestion = null;
    llmStub.merge = null;

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
    adminToken = extractAccessTokenFromCookies(loginRes.headers['set-cookie']);

    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'AI Docs Project' })
      .expect(201);
  });

  function authReq() {
    const auth = (m: 'get' | 'post' | 'patch' | 'put' | 'delete') => (url: string) =>
      request(ctx.app.getHttpServer())
        [m](url)
        .set('Authorization', `Bearer ${adminToken}`);
    return { get: auth('get'), post: auth('post'), patch: auth('patch'), put: auth('put'), delete: auth('delete') };
  }

  async function project() {
    const proj = await ctx.prisma.project.findFirstOrThrow({
      where: { key: projectKey },
      include: { workflows: { where: { isDefault: true }, include: { statuses: true } } },
    });
    return { id: proj.id, statuses: proj.workflows[0].statuses };
  }

  async function adminId(): Promise<string> {
    const u = await ctx.prisma.user.findFirstOrThrow({ where: { email: 'admin@test.local' } });
    return u.id;
  }

  async function createIssue(body: Record<string, unknown>) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send(body)
      .expect(201);
    return res.body.data as { id: string; number: number };
  }

  async function patchStatus(issueNumber: number, statusId: string) {
    await authReq()
      .patch(`/projects/${projectKey}/issues/${issueNumber}`)
      .send({ statusId })
      .expect(200);
  }

  function runProcessor(data: DocGenJobData) {
    return ctx.app
      .get(DocGenerationProcessor)
      .process({ data } as unknown as Job<DocGenJobData>);
  }

  async function seedProposal(
    projectId: string,
    opts: {
      sourceIssueId: string;
      docIssueId: string;
      targetArticleId?: string | null;
      proposedTitle?: string;
      proposedContent?: TiptapDoc;
      baseArticleSha?: string | null;
    },
  ) {
    return ctx.prisma.docUpdateProposal.create({
      data: {
        projectId,
        sourceIssueId: opts.sourceIssueId,
        docIssueId: opts.docIssueId,
        targetArticleId: opts.targetArticleId ?? null,
        proposedTitle: opts.proposedTitle ?? 'Proposed Guide',
        proposedContent: (opts.proposedContent ?? DOC) as object,
        rationale: 'because the resolution changed behavior',
        baseArticleSha: opts.baseArticleSha ?? null,
      },
    });
  }

  it('processor creates a doc-update issue + PENDING proposal from a suggestion', async () => {
    const { id: projectId } = await project();
    const userId = await adminId();
    const source = await createIssue({ title: 'Add SSO', type: 'FEATURE', description: DOC });
    llmStub.suggestion = {
      shouldUpdate: true,
      targetArticleId: null,
      proposedTitle: 'Auth Guide',
      proposedContentJson: JSON.stringify(DOC),
      rationale: 'SSO login is now available.',
    };

    await runProcessor({ sourceIssueId: source.id, projectId, userId });

    const proposal = await ctx.prisma.docUpdateProposal.findFirst({
      where: { sourceIssueId: source.id },
    });
    expect(proposal).not.toBeNull();
    expect(proposal!.status).toBe('PENDING');
    expect(proposal!.targetArticleId).toBeNull();

    const docIssue = await ctx.prisma.issue.findUnique({ where: { id: proposal!.docIssueId } });
    expect(docIssue!.title).toContain('Update docs');
  });

  it('applies the draft as a new article when the doc-update issue is moved to Done', async () => {
    const { id: projectId, statuses } = await project();
    const done = statuses.find((s) => s.name === 'Done')!;
    const source = await createIssue({ title: 'src', type: 'FEATURE', description: DOC });
    const docIssue = await createIssue({ title: 'Update docs: Auth Guide', type: 'TASK' });
    await seedProposal(projectId, {
      sourceIssueId: source.id,
      docIssueId: docIssue.id,
      targetArticleId: null,
      proposedTitle: 'Auth Guide',
    });

    await patchStatus(docIssue.number, done.id);
    await ctx.pumpDomainEvents();

    const article = await ctx.prisma.article.findFirst({
      where: { projectId, title: 'Auth Guide' },
    });
    expect(article).not.toBeNull();

    const proposal = await ctx.prisma.docUpdateProposal.findUnique({
      where: { docIssueId: docIssue.id },
    });
    expect(proposal!.status).toBe('ACCEPTED');
  });

  it('rejects the proposal when the doc-update issue is cancelled', async () => {
    const { id: projectId, statuses } = await project();
    const wontFix = statuses.find((s) => s.name === "Won't Fix")!;
    const source = await createIssue({ title: 'src', type: 'FEATURE', description: DOC });
    const docIssue = await createIssue({ title: 'Update docs: Ghost', type: 'TASK' });
    await seedProposal(projectId, {
      sourceIssueId: source.id,
      docIssueId: docIssue.id,
      targetArticleId: null,
      proposedTitle: 'Ghost',
    });

    await patchStatus(docIssue.number, wontFix.id);
    await ctx.pumpDomainEvents();

    const proposal = await ctx.prisma.docUpdateProposal.findUnique({
      where: { docIssueId: docIssue.id },
    });
    expect(proposal!.status).toBe('REJECTED');
    const article = await ctx.prisma.article.findFirst({ where: { projectId, title: 'Ghost' } });
    expect(article).toBeNull();
  });

  it('does not overwrite an overlapping human edit; reopens with conflict', async () => {
    const { id: projectId, statuses } = await project();
    const done = statuses.find((s) => s.name === 'Done')!;
    const userId = await adminId();

    const original: TiptapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'original' }] }],
    };
    const article = await ctx.prisma.article.create({
      data: { projectId, title: 'Guide', slug: 'guide', content: original as object, createdById: userId },
    });

    const source = await createIssue({ title: 'src', type: 'FEATURE', description: DOC });
    const docIssue = await createIssue({ title: 'Update docs: Guide', type: 'TASK' });
    await seedProposal(projectId, {
      sourceIssueId: source.id,
      docIssueId: docIssue.id,
      targetArticleId: article.id,
      baseArticleSha: canonicalTiptapHash(original),
      proposedContent: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'proposed' }] }],
      },
    });

    // Human edits the article after the draft was captured.
    const edited: TiptapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'human edit' }] }],
    };
    await ctx.prisma.article.update({ where: { id: article.id }, data: { content: edited as object } });

    llmStub.merge = {
      mergedContentJson: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'merged' }] }],
      }),
      overlap: true,
    };

    await patchStatus(docIssue.number, done.id);
    await ctx.pumpDomainEvents();

    const proposal = await ctx.prisma.docUpdateProposal.findUnique({
      where: { docIssueId: docIssue.id },
    });
    expect(proposal!.status).toBe('PENDING'); // not applied
    expect(proposal!.conflictResolvedAt).not.toBeNull();

    const after = await ctx.prisma.article.findUnique({ where: { id: article.id } });
    expect(after!.content).toEqual(edited); // human edit preserved
  });

  it('round-trips per-project prompt settings', async () => {
    await authReq()
      .put(`/projects/${projectKey}/ai-docs/settings`)
      .send({ suggestionPrompt: 'custom suggestion', mergePrompt: null })
      .expect(200);

    const res = await authReq()
      .get(`/projects/${projectKey}/ai-docs/settings`)
      .expect(200);

    expect(res.body.data.suggestionPrompt).toBe('custom suggestion');
    expect(res.body.data.mergePrompt).toBeNull();
    expect(res.body.data.defaults.suggestion).toBeTruthy();
  });
});
