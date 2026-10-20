import { Readable } from 'stream';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DeliveryChannel, OutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_ROLES } from '@repo/shared';
import {
  startSearchEngine,
  type StartedOpenSearchContainer,
} from '@repo/test-support/containers';
import { AppModule } from '@/app.module';
import { configureApp } from '@/bootstrap/configure-app';
import { PrismaService } from '@/prisma/prisma.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { WsAdapter } from '@/common/adapters/ws.adapter';
import { ValkeyService } from '@/valkey/valkey.service';
import { SearchEngineService } from '@/modules/search/engine/search-engine.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { DomainEventsProcessor } from '@/modules/outbox/domain-events.processor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailProcessor } from '@/modules/mail/email.processor';
import { WebhookDeliveryProcessor } from '@/modules/webhooks/webhook-delivery.processor';
import { TelegramDeliveryProcessor } from '@/modules/telegram/telegram-delivery.processor';
import { NotificationJobsProcessor } from '@/modules/notifications/notification-jobs.processor';
import { IssueIndexingProcessor } from '@/modules/search/indexer/issue-indexing.processor';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { SEARCH_INDEXING_QUEUE } from '@/modules/search/indexer/indexing-queue';
import { AttachmentsStorageService } from '@/modules/attachments/attachments-storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { workerDatabaseUrl, workerValkeyUrl } from './test-env';

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaClient;
  /** The app's background-task tracker — `teardownE2eApp` drains it. */
  background: BackgroundTasks;
  /**
   * Waits until every domain event published so far has been delivered to its
   * listeners AND every background write those listeners scheduled has landed.
   * Use this instead of sleeping before asserting on an activity, notification,
   * watcher or outbox row — it is deterministic, and it returns as soon as the
   * work is done rather than after a guessed interval.
   */
  settle: () => Promise<void>;
  /**
   * `settle()` plus a wait for the `search-indexing` queue to drain. Only
   * meaningful with `withSearchEngine: true`; with the mocked engine the queue
   * is never fed, so this degrades to `settle()`.
   */
  settleSearchIndex: () => Promise<void>;
  searchEngineContainer?: StartedOpenSearchContainer;
}

export interface CreateE2eAppOptions {
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  withSearchEngine?: boolean;
  withWebSockets?: boolean;
}

// Ensure previous spec's app is fully closed before next starts
let pendingTeardown: Promise<void> | undefined;

// The active app's background-task tracker. Safe as a module-level singleton
// because a Jest worker runs one spec file at a time, and each spec file owns
// one app. `truncateTables` drains it before truncating so a late
// event-listener write can never land in the next test's freshly-truncated
// schema.
let currentBackground: BackgroundTasks | undefined;

// In production INTERNAL outbox events flow poller -> domain-events queue ->
// DomainEventsProcessor -> EventEmitter2. The harness mocks the poller, so this
// dispatcher plays that role — but only when a test asks for it, via
// `ctx.settle()`. It deliberately does NOT run on a timer: a background
// interval made delivery non-deterministic (tests compensated with sleeps),
// queried `outbox_events` twenty times a second for the whole run, and raced
// the `TRUNCATE` in `beforeEach`.
interface DomainEventDispatcher {
  /** Delivers all PENDING INTERNAL rows; returns how many were dispatched. */
  flush: () => Promise<number>;
}

const DISPATCH_BATCH_SIZE = 100;

function createDomainEventDispatcher(
  app: INestApplication,
  prisma: PrismaClient,
): DomainEventDispatcher {
  const emitter = app.get(EventEmitter2);
  // Serialize concurrent flushes so two callers can't dispatch the same row.
  let chain: Promise<number> = Promise.resolve(0);

  const flushBatch = async (): Promise<number> => {
    let rows;
    try {
      rows = await prisma.outboxEvent.findMany({
        where: {
          status: OutboxStatus.PENDING,
          channel: DeliveryChannel.INTERNAL,
        },
        orderBy: { createdAt: 'asc' },
        take: DISPATCH_BATCH_SIZE,
      });
    } catch {
      // Table may be mid-truncate — nothing to dispatch this round.
      return 0;
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

    return rows.length;
  };

  // A listener can publish further events, so keep going until the table is dry.
  const flushAll = async (): Promise<number> => {
    let total = 0;
    for (;;) {
      const dispatched = await flushBatch();
      total += dispatched;
      if (dispatched < DISPATCH_BATCH_SIZE) return total;
    }
  };

  return {
    flush: () => {
      const result = chain.then(flushAll);
      // Keep the ordering guarantee without letting one rejection poison every
      // later flush.
      chain = result.catch(() => 0);
      return result;
    },
  };
}

// How many dispatch/drain rounds `settle()` will run before giving up. Each
// round can uncover new work (a listener publishes an event; a drained
// background task publishes another), so one round is not enough — but a
// handler that re-publishes forever must not hang the hook either.
const MAX_SETTLE_ROUNDS = 10;

/**
 * Deterministic quiescence barrier. Alternates "deliver every pending domain
 * event" with "wait for every tracked background write", until a round finds
 * nothing left to do — a listener can publish further events, and a drained
 * background task can publish some too.
 */
async function settleApp(
  dispatcher: DomainEventDispatcher | undefined,
  background: BackgroundTasks | undefined,
): Promise<void> {
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round++) {
    let dispatched = 0;
    try {
      dispatched = (await dispatcher?.flush()) ?? 0;
    } catch (err) {
      console.warn(`[settle] dispatching domain events failed: ${String(err)}`);
      return;
    }

    if (!(await drainBackground(background))) return;
    if (dispatched === 0) return;
  }
  console.warn(
    `[settle] still producing work after ${MAX_SETTLE_ROUNDS} rounds; proceeding`,
  );
}

/**
 * Waits for tracked fire-and-forget work (event-listener writes, dispatch,
 * indexing) to finish. Returns false if the drain timed out, so callers can
 * stop looping instead of stacking 15s waits.
 */
async function drainBackground(
  background: BackgroundTasks | undefined,
): Promise<boolean> {
  if (!background) return true;
  const drained = await background.whenIdle(DRAIN_TIMEOUT_MS);
  if (!drained) {
    console.warn('[settle] background drain timed out; proceeding');
  }
  return drained;
}

// Upper bound on waiting for the search-indexing queue to empty. Each job is a
// `refresh: 'wait_for'` round-trip to the engine, so a handful of documents is
// fast; the cap only exists so a wedged worker fails the test rather than the
// whole run.
const SEARCH_INDEX_TIMEOUT_MS = 30_000;
const SEARCH_INDEX_POLL_MS = 50;

async function waitForQueueDrained(
  queue: Queue,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'paused',
    );
    const outstanding =
      (counts.waiting ?? 0) +
      (counts.active ?? 0) +
      (counts.delayed ?? 0) +
      (counts.paused ?? 0);
    if (outstanding === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `search-indexing queue did not drain within ${timeoutMs}ms (${outstanding} job(s) outstanding)`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, SEARCH_INDEX_POLL_MS));
  }
}

// Upper bound on draining background work. Generous (the common case finishes
// in well under a second) but caps a cascading/stuck handler so a Jest hook
// can't hit its 60s timeout waiting for an unbounded drain.
const DRAIN_TIMEOUT_MS = 15_000;

// Upper bound on `app.close()`. Closing awaits every module's shutdown hook —
// a BullMQ worker mid-job, an engine client with an in-flight request. Left
// unbounded, one stuck hook burns the whole Jest hook budget and everything
// after it in teardown never runs: the app holds its Prisma pool and workers,
// and the engine container keeps running, for every remaining spec of the run.
// That is how a single slow teardown turned into a 4 GB heap and a hard OOM.
const CLOSE_TIMEOUT_MS = 20_000;

async function closeAppWithin(
  app: INestApplication | undefined,
  ms: number,
): Promise<void> {
  if (!app) return;

  let timer: NodeJS.Timeout | undefined;
  // A failure to close is not worth failing an otherwise-green spec over —
  // the `finally` below releases the resources that actually matter.
  const closed = app
    .close()
    .catch(() => {})
    .then(() => true);
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
    timer.unref();
  });

  const finished = await Promise.race([closed, timedOut]);
  clearTimeout(timer);
  if (!finished) {
    console.warn('[teardownE2eApp] app.close() timed out; proceeding');
  }
}

/**
 * Keys are checked against the real class, values are not: a mock must never be
 * able to keep answering a method that was renamed or deleted, but forcing it to
 * fabricate the real return types (an S3 `WriteResponseBase`, an engine
 * `BulkResult`) would buy nothing.
 */
type MockOf<T> = Partial<Record<keyof T, unknown>>;

const mockStorageService: MockOf<AttachmentsStorageService> = {
  onModuleInit: async () => {},
  uploadBuffer: async () => {},
  getObject: async () => ({
    body: Readable.from([Buffer.from('mock-object')]),
    contentType: 'application/octet-stream',
  }),
  deleteFile: async () => {},
  exists: async () => false,
};

const mockProcessor = {
  process: async () => {},
  markProcessed: async () => {},
  markFailed: async () => {},
};

// Mocked alongside the indexing processor: with no engine there is no worker
// to consume `search-indexing` jobs, but the real hook would still enqueue one
// per issue mutation. Those jobs outlive the spec — `truncateTables` clears
// Postgres, not Redis — so the whole run's backlog lands on the ONE spec that
// does start a real worker, which then drains hundreds of stale ids (each a
// `refresh: 'wait_for'` round-trip) before it reaches its own documents.
const mockIndexerHooks: MockOf<IndexerHooksService> = {
  onIssueChanged: async () => {},
  onIssueDeleted: async () => {},
  enqueueProjectReindex: async () => {},
};

// Every key below is a real method on `SearchEngineService`. It used to declare
// four more — createIndex, deleteIndex, indexExists, update — that the service
// does not have; `MockOf` is what now makes that impossible.
const mockSearchEngineService: MockOf<SearchEngineService> = {
  onModuleInit: async () => {},
  onModuleDestroy: async () => {},
  issuesIndex: 'test-issues',
  search: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  index: async () => {},
  delete: async () => {},
  bulk: async () => ({ errors: false }),
  // Used by HealthController.searchEngineHealth — a resolving ping lets the
  // health check report 'ok' without requiring a real engine container.
  ping: async () => {},
};

export async function createE2eApp(
  options: CreateE2eAppOptions = {},
): Promise<E2eContext> {
  // Wait for any in-progress teardown to complete before creating a new app
  if (pendingTeardown) {
    await pendingTeardown;
    pendingTeardown = undefined;
  }

  // Each Jest worker gets its own database and its own Valkey logical database:
  // specs `TRUNCATE` between cases, so sharing either across workers would have
  // them clearing each other's fixtures. Set before `compile()` — `valkeyConfig`
  // reads the env var at factory time.
  const dbUrl = workerDatabaseUrl();
  process.env.DATABASE_URL = dbUrl;
  process.env.VALKEY_URL = workerValkeyUrl();

  // Start the search-engine container on-demand (only for search spec)
  let searchEngineContainer: StartedOpenSearchContainer | undefined;
  if (options.withSearchEngine) {
    searchEngineContainer = await startSearchEngine();
    process.env.SEARCH_ENGINE_URL = `http://${searchEngineContainer.getHost()}:${searchEngineContainer.getMappedPort(9200)}`;
  }

  // Pool sized with headroom: the app, its burst of background tasks (e.g. a
  // sprint-close fanning out many `issue.updated` → dispatch transactions), and
  // the test's own queries all share this pool. At max:5 a background burst can
  // starve `truncateTables` (which needs ACCESS EXCLUSIVE on every table),
  // stalling `beforeEach` to its 60s Jest-hook timeout. One app per worker and
  // `max_connections=200` on the container leave ample headroom at this size.
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
  if (!options.withSearchEngine) {
    builder = builder
      .overrideProvider(SearchEngineService)
      .useValue(mockSearchEngineService)
      .overrideProvider(IssueIndexingProcessor)
      .useValue(mockProcessor)
      .overrideProvider(IndexerHooksService)
      .useValue(mockIndexerHooks);
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
  // Disable Nest's built-in body parser so configureApp's raised-limit parsers
  // are authoritative here too (prod ⇄ test parity on the request body limit).
  const app = module.createNestApplication({ bodyParser: false });
  configureApp(app);

  if (options.withWebSockets) {
    const redisClient = app.get(ValkeyService).getClient();
    app.useWebSocketAdapter(new WsAdapter(app, ['*'], redisClient));
  }

  // Disable throttling. `AppModule` already collapses the named throttlers to a
  // single `{ ttl: 0, limit: 0 }` bucket under NODE_ENV=test, but the route-level
  // `@Throttle({ short: … })` decorators on /auth/* would still bind if that
  // bucket were ever renamed — and the login limit is 5/5min, which any spec
  // that logs in per test would exhaust. Patching the base prototype covers the
  // real guard too: `ApiKeyAwareThrottlerGuard` extends `ThrottlerGuard` and does
  // not override `canActivate`, so it inherits this.
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

  const dispatcher = createDomainEventDispatcher(app, prisma);

  const settle = () => settleApp(dispatcher, background);

  return {
    app,
    prisma,
    background,
    settle,
    settleSearchIndex: async () => {
      await settle();
      // Resolved here rather than at app creation so a spec that never touches
      // search can't be broken by the queue token failing to resolve.
      const queue = app.get<Queue>(getQueueToken(SEARCH_INDEXING_QUEUE));
      await waitForQueueDrained(queue, SEARCH_INDEX_TIMEOUT_MS);
    },
    searchEngineContainer,
  };
}

export async function teardownE2eApp(ctx: E2eContext | undefined): Promise<void> {
  if (!ctx) return;

  const doTeardown = async () => {
    // Drain in-flight fire-and-forget work before closing, so no orphaned write
    // outlives the app. Drain only — do NOT dispatch: an event the spec never
    // settled has no listener work in flight, so there is nothing to orphan, and
    // delivering it now would schedule writes into an app that is about to
    // close. `app.close()` then runs `BackgroundTasks.onModuleDestroy`, a second
    // (also bounded) drain covering work scheduled during shutdown.
    try {
      await drainBackground(ctx.background);
      if (currentBackground === ctx.background) {
        currentBackground = undefined;
      }
      await closeAppWithin(ctx.app, CLOSE_TIMEOUT_MS);
    } finally {
      // Releasing these is what keeps a failed teardown local to its own spec,
      // so they run even when the steps above threw or timed out.
      await ctx.prisma?.$disconnect().catch(() => {});
      await ctx.searchEngineContainer?.stop().catch(() => {});
    }
  };

  // Store as pending so next createE2eApp waits for it
  pendingTeardown = doTeardown();
  await pendingTeardown;
}

// The public schema does not change during a run, so look the table list up
// once per worker process instead of on every `beforeEach`.
let cachedTruncateSql: string | undefined;

async function truncateStatement(
  prisma: PrismaClient,
): Promise<string | undefined> {
  if (cachedTruncateSql !== undefined) return cachedTruncateSql;

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return undefined;

  // One statement for every table: TRUNCATE takes ACCESS EXCLUSIVE on each, and
  // acquiring them all at once is what keeps concurrent writers from
  // interleaving into a deadlock.
  const tableNames = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  cachedTruncateSql = `TRUNCATE TABLE ${tableNames} CASCADE`;
  return cachedTruncateSql;
}

export async function truncateTables(prisma: PrismaClient): Promise<void> {
  // Drain the previous test's in-flight fire-and-forget work (Activity /
  // Notification rows, dispatch, indexing) before truncating, so a late write
  // can't FK-violate against — or repopulate — the table we're about to clear.
  // Undelivered outbox rows need no dispatching: the TRUNCATE removes them, and
  // delivering another test's events here would be pure waste. Bounded, so a
  // cascading handler can't hang the hook; the TRUNCATE deadlock-retry below
  // covers the case where we proceed anyway.
  await drainBackground(currentBackground);

  const sql = await truncateStatement(prisma);
  if (!sql) return;

  // Retry on 40P01 (deadlock_detected): an async event-listener write that
  // slipped past the drain can overlap the TRUNCATE, and Postgres may elect
  // either side as the victim.
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
 * Seeds the same system roles `prisma/seed.ts` writes, from the same shared
 * definitions — a test can never pass against a role table production would
 * not produce. Must be called after `truncateTables()`, because project
 * creation assigns the creator the Project Admin role id.
 */
export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  await prisma.role.createMany({
    data: SYSTEM_ROLES.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions] as Prisma.InputJsonValue,
      isSystem: true,
    })),
  });
}
