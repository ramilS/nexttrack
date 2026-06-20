import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';

/** Ceiling on the graceful-shutdown drain so a hung task can't wedge shutdown. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

/**
 * Tracks fire-and-forget background work (event-listener side effects,
 * notification dispatch, search indexing) so it can be drained deterministically.
 *
 * - Production: `onModuleDestroy` waits for in-flight tasks before shutdown, so a
 *   deploy/restart never drops an in-flight notification or activity write.
 * - Integration tests: specs drain via `whenIdle()` before truncating the DB,
 *   removing the race where a late listener write lands in the next test's
 *   freshly-truncated schema (FK violation) or hits a half-closed socket.
 */
@Injectable()
export class BackgroundTasks implements OnModuleDestroy {
  private readonly logger = new AppLogger(BackgroundTasks.name);
  private readonly pending = new Set<Promise<unknown>>();

  /**
   * Track an in-flight promise. Returns the same (settled-safe) promise so
   * callers may also await it — used by event listeners that must stay
   * awaitable in unit tests while running untracked under `emit()` in prod.
   */
  track<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      this.pending.delete(tracked);
    });
    this.pending.add(tracked);
    return tracked;
  }

  /**
   * Start a fire-and-forget task and track it. Errors are routed to `onError`
   * (never rethrown) so a failing side effect can't surface as an unhandled
   * rejection or crash the process.
   */
  run(task: () => Promise<unknown>, onError: (err: Error) => void): void {
    const started = task().catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    });
    void this.track(started);
  }

  /**
   * Resolve once no tracked tasks remain — including tasks they spawn.
   *
   * `timeoutMs` bounds the wait: fire-and-forget handlers can cascade (an event
   * triggers a rule that emits another event…), so an unbounded drain could
   * spin forever. On timeout this resolves anyway, leaving any stragglers to
   * finish on their own. Returns `true` if fully drained, `false` if it timed
   * out with work still pending.
   */
  async whenIdle(timeoutMs?: number): Promise<boolean> {
    const drained = (async () => {
      while (this.pending.size > 0) {
        await Promise.allSettled([...this.pending]);
      }
    })();

    if (timeoutMs == null) {
      await drained;
      return true;
    }

    let timer: NodeJS.Timeout | undefined;
    const timedOut = Symbol('timedOut');
    const timeout = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), timeoutMs);
      timer.unref?.();
    });

    const result = await Promise.race([drained.then(() => true), timeout]);
    if (timer) clearTimeout(timer);
    return result === true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pending.size === 0) return;
    this.logger.log('Draining background tasks before shutdown', {
      pending: this.pending.size,
    });
    const drained = await this.whenIdle(SHUTDOWN_DRAIN_TIMEOUT_MS);
    if (!drained) {
      this.logger.warn('Shutdown drain timed out with tasks still pending', {
        pending: this.pending.size,
      });
    }
  }
}
