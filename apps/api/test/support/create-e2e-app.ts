import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryChannel, OutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS, Permission } from '@repo/shared';
import {
  startElasticsearch,
  type StartedElasticsearchContainer,
} from '@repo/test-support/containers';
import { AppModule } from '@/app.module';
import { configureApp } from '@/bootstrap/configure-app';
import { PrismaService } from '@/prisma/prisma.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { WsAdapter } from '@/common/adapters/ws.adapter';
import { ValkeyService } from '@/valkey/valkey.service';
import { ElasticsearchService } from '@/modules/search/elasticsearch/elasticsearch.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { DomainEventsProcessor } from '@/modules/outbox/domain-events.processor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailProcessor } from '@/modules/mail/email.processor';
import { WebhookDeliveryProcessor } from '@/modules/webhooks/webhook-delivery.processor';
import { TelegramDeliveryProcessor } from '@/modules/telegram/telegram-delivery.processor';
import { NotificationJobsProcessor } from '@/modules/notifications/notification-jobs.processor';
import { IssueIndexingProcessor } from '@/modules/search/indexer/issue-indexing.processor';
import { AttachmentsStorageService } from '@/modules/attachments/attachments-storage.service';

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaClient;
  background: BackgroundTasks;
  pumpDomainEvents: () => Promise<void>;
  esContainer?: StartedElasticsearchContainer;
}

export interface CreateE2eAppOptions {
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  withElasticsearch?: boolean;
  withWebSockets?: boolean;
}

// Ensure previous spec's app is fully closed before next starts
let pendingTeardown: Promise<void> | undefined;

// The active app's background-task tracker. Safe as a module-level singleton
// because integration suites run with `maxWorkers: 1` (one app at a time).
// `truncateTables` drains it before truncating so a late event-listener write
// can never land in the next test's freshly-truncated schema.
let currentBackground: BackgroundTasks | undefined;

// In production INTERNAL outbox events flow poller -> domain-events queue ->
// DomainEventsProcessor -> EventEmitter2. The harness mocks the poller, so a
// lightweight pump dispatches PENDING INTERNAL rows straight to the app's
// EventEmitter2 — existing poll-until-side-effect tests keep working.
interface DomainEventPump {
  flush: () => Promise<void>;
  stop: () => void;
}

let currentPump: DomainEventPump | undefined;

function startDomainEventPump(
  app: INestApplication,
  prisma: PrismaClient,
): DomainEventPump {
  const emitter = app.get(EventEmitter2);
  let chain: Promise<void> = Promise.resolve();

  const flushOnce = async (): Promise<void> => {
    let rows;
    try {
      rows = await prisma.outboxEvent.findMany({
        where: {
          status: OutboxStatus.PENDING,
          channel: DeliveryChannel.INTERNAL,
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
    } catch {
      // Table may be mid-truncate between tests — skip this tick.
      return;
    }

    for (const row of rows) {
      try {
        await emitter.emitAsync(row.eventType, {
          ...((row.payload ?? {}) as Record<string, unknown>),
          eventId: row.id,
        });
        await prisma.outboxEvent.update({
          where: { id: row.id },
          data: { status: OutboxStatus.PROCESSED, processedAt: new Date() },
        });
      } catch (err) {
        await prisma.outboxEvent
          .update({
            where: { id: row.id },
            data: {
              status: OutboxStatus.FAILED,
              lastError: String(err).slice(0, 2000),
            },
          })
          .catch(() => {});
      }
    }
  };

  const flush = () => {
    chain = chain.then(flushOnce);
    return chain;
  };

  const interval = setInterval(() => void flush(), 50);
  interval.unref();
  return { flush, stop: () => clearInterval(interval) };
}

// Upper bound on draining background work. Generous (the common case finishes
// in well under a second) but caps a cascading/stuck handler so a Jest hook
// can't hit its 60s timeout waiting for an unbounded drain.
const DRAIN_TIMEOUT_MS = 15_000;

const mockStorageService = {
  onModuleInit: async () => {},
  uploadBuffer: async () => {},
  getSignedDownloadUrl: async () => 'https://mock-s3/file',
  deleteFile: async () => {},
  fileExists: async () => false,
};

const mockProcessor = {
  process: async () => {},
  markProcessed: async () => {},
  markFailed: async () => {},
};

const mockElasticsearchService = {
  onModuleInit: async () => {},
  onModuleDestroy: async () => {},
  issuesIndex: 'test-issues',
  search: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  index: async () => {},
  update: async () => {},
  delete: async () => {},
  bulk: async () => ({ errors: false }),
  createIndex: async () => {},
  deleteIndex: async () => {},
  indexExists: async () => false,
  // Used by HealthController.esHealth — returning a stub client lets the
  // health check report 'ok' without requiring a real ES container.
  getClient: () => ({
    cluster: { health: async () => ({ status: 'green' }) },
  }),
};

export async function createE2eApp(
  options: CreateE2eAppOptions = {},
): Promise<E2eContext> {
  // Wait for any in-progress teardown to complete before creating a new app
  if (pendingTeardown) {
    await pendingTeardown;
    pendingTeardown = undefined;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is not set. Ensure globalSetup has run (jest --config test/jest-integration.json).',
    );
  }

  // Start Elasticsearch container on-demand (only for search spec)
  let esContainer: StartedElasticsearchContainer | undefined;
  if (options.withElasticsearch) {
    esContainer = await startElasticsearch();
    process.env.ELASTICSEARCH_URL = `http://${esContainer.getHost()}:${esContainer.getMappedPort(9200)}`;
  }

  // Pool sized with headroom: the app, its burst of background tasks (e.g. a
  // sprint-close fanning out many `issue.updated` → dispatch transactions), and
  // the test's own queries all share this pool. At max:5 a background burst can
  // starve `truncateTables` (which needs ACCESS EXCLUSIVE on every table),
  // stalling `beforeEach` to its 60s Jest-hook timeout. Only one app runs at a
  // time (`maxWorkers:1`) and Postgres allows 200 connections, so this is safe.
  const adapter = new PrismaPg({
    connectionString: dbUrl,
    max: 25,
  });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // Build module from AppModule with overrides
  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma);

  // Only mock ES when no real container is available. The indexing processor
  // is mocked alongside it — with real ES it must process real jobs so the
  // search integration spec sees created issues land in the index.
  if (!options.withElasticsearch) {
    builder = builder
      .overrideProvider(ElasticsearchService)
      .useValue(mockElasticsearchService)
      .overrideProvider(IssueIndexingProcessor)
      .useValue(mockProcessor);
  }

  builder = builder
    .overrideProvider(OutboxPollerProcessor)
    .useValue(mockProcessor)
    .overrideProvider(DomainEventsProcessor)
    .useValue(mockProcessor)
    .overrideProvider(EmailProcessor)
    .useValue(mockProcessor)
    .overrideProvider(WebhookDeliveryProcessor)
    .useValue(mockProcessor)
    .overrideProvider(TelegramDeliveryProcessor)
    .useValue(mockProcessor)
    .overrideProvider(NotificationJobsProcessor)
    .useValue(mockProcessor)
    .overrideProvider(AttachmentsStorageService)
    .useValue(mockStorageService);

  if (options.customize) {
    builder = options.customize(builder);
  }

  const module = await builder.compile();

  // Create NestJS app with throttling disabled. `configureApp` applies the
  // same request-pipeline middleware (request id, helmet, cookie parser) the
  // production bootstrap uses, keeping prod ⇄ test behavior in parity.
  const app = module.createNestApplication();
  configureApp(app);

  if (options.withWebSockets) {
    const redisClient = app.get(ValkeyService).getClient();
    app.useWebSocketAdapter(new WsAdapter(app, ['*'], redisClient));
  }

  // Disable throttling by monkey-patching the guard prototype
  ThrottlerGuard.prototype.canActivate = async () => true;

  await app.init();

  // Always bind a real listening server (not only for WebSocket specs). When
  // the server isn't listening, supertest does an ephemeral `listen(0)`/`close()`
  // for *every* request — thousands of binds across the run, with heavy
  // ephemeral-port recycling. A request can then hit a half-closed socket from a
  // just-closed bind ("Parse Error: Expected HTTP") or get misrouted (307/404).
  // Listening once per suite lets supertest reuse a single stable server.
  await app.listen(0);

  const background = app.get(BackgroundTasks);
  currentBackground = background;

  const pump = startDomainEventPump(app, prisma);
  currentPump = pump;

  return {
    app,
    prisma,
    background,
    pumpDomainEvents: pump.flush,
    esContainer,
  };
}

export async function teardownE2eApp(ctx: E2eContext | undefined): Promise<void> {
  if (!ctx) return;

  const doTeardown = async () => {
    // Deterministically drain in-flight event-listener / dispatch work before
    // closing, so no orphaned write outlives the app (the old fixed-`setTimeout`
    // sleeps only mitigated this probabilistically). Bounded so a stuck handler
    // can't hang teardown. `app.close()` then runs `BackgroundTasks.onModuleDestroy`,
    // a second (also bounded) drain covering work scheduled during shutdown.
    await currentPump?.flush().catch(() => {});
    currentPump?.stop();
    currentPump = undefined;
    await ctx.background?.whenIdle(DRAIN_TIMEOUT_MS).catch(() => {});
    if (currentBackground === ctx.background) {
      currentBackground = undefined;
    }
    await ctx.app?.close().catch(() => {});
    await ctx.prisma?.$disconnect();
    await ctx.esContainer?.stop();
  };

  // Store as pending so next createE2eApp waits for it
  pendingTeardown = doTeardown();
  await pendingTeardown;
}

export async function truncateTables(prisma: PrismaClient): Promise<void> {
  // Drain the active app's fire-and-forget work (event listeners writing
  // Activity/Notification rows, dispatch, indexing) before truncating, so a
  // late write from the previous test can't FK-violate against — or repopulate
  // — the table we're about to clear. Deterministic replacement for the old
  // teardown sleeps. Bounded so a cascading/stuck handler can't hang the hook;
  // on timeout we proceed and lean on the TRUNCATE deadlock-retry below.
  await currentPump?.flush().catch(() => {});
  if (currentBackground) {
    const drained = await currentBackground.whenIdle(DRAIN_TIMEOUT_MS);
    if (!drained) {
      console.warn('[truncateTables] background drain timed out; proceeding');
    }
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  // Truncate all tables in a single statement to avoid deadlocks.
  // Retry on 40P01 (deadlock_detected): when integration suites run in
  // parallel and async event-listener writes overlap with TRUNCATE,
  // Postgres can elect either side as the deadlock victim.
  const tableNames = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  const sql = `TRUNCATE TABLE ${tableNames} CASCADE`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err: unknown) {
      const errObj = err as { code?: string; meta?: { code?: string } };
      const code = errObj?.code ?? errObj?.meta?.code;
      if (code !== '40P01' || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
}

/**
 * Seeds the system roles that are normally created by `prisma/seed.ts`.
 * Must be called after `truncateTables()` in integration tests, because
 * project creation assigns the creator roleId '...0001' (Project Admin).
 */
export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  await prisma.role.createMany({
    data: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Project Admin',
        description: 'Full access to all project features and settings',
        permissions: ALL_PERMISSIONS as Prisma.InputJsonValue,
        isSystem: true,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Developer',
        description: 'Full issue management, comments, articles, tags, boards, and time tracking',
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
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'QA',
        description: 'Same as Developer plus can delete issues',
        permissions: [
          Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE,
          Permission.ISSUE_DELETE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE,
          Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
          Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE,
          Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN,
        ] as Prisma.InputJsonValue,
        isSystem: true,
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Reporter',
        description: 'Can create issues and comments, read articles, and log own time',
        permissions: [
          Permission.ISSUE_READ, Permission.ISSUE_CREATE,
          Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
          Permission.ARTICLE_READ, Permission.TIME_LOG_OWN,
        ] as Prisma.InputJsonValue,
        isSystem: true,
      },
      {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'Observer',
        description: 'Read-only access to issues and articles',
        permissions: [Permission.ISSUE_READ, Permission.ARTICLE_READ] as Prisma.InputJsonValue,
        isSystem: true,
      },
    ],
  });
}
