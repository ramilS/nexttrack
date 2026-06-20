import {
  context,
  propagation,
  trace,
  type Context,
} from '@opentelemetry/api';

const TRACEPARENT = 'traceparent';

/**
 * Serialize the active OTel context to a W3C `traceparent` string, or null
 * when no span is sampled/active. Stored on the outbox row so the async
 * event chain can rejoin the originating trace after the DB persistence gap.
 */
export function captureTraceparent(): string | null {
  if (!trace.getActiveSpan()) return null;
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier[TRACEPARENT] ?? null;
}

/**
 * Restore a W3C `traceparent` string into an active OTel context and run `fn`
 * inside it, so spans created by `fn` become children of the original trace.
 * A null/absent traceparent runs `fn` under the current (fresh) context.
 */
export function runWithTraceparent<T>(
  traceparent: string | null | undefined,
  fn: () => T,
): T {
  if (!traceparent) return fn();
  const ctx: Context = propagation.extract(context.active(), {
    [TRACEPARENT]: traceparent,
  });
  return context.with(ctx, fn);
}
