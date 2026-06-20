import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBooleanOptional } from './helpers';

const schema = z.object({
  pollIntervalMs: z.coerce.number().default(5000),
  batchSize: z.coerce.number().default(100),
  staleTimeoutMs: z.coerce.number().default(60000),
  // Tri-state: unset → derived from NODE_ENV (off in tests). The e2e stack
  // sets it explicitly: it runs with NODE_ENV=test but needs real dispatch.
  pollerEnabled: envBooleanOptional(),
});

export type OutboxConfig = z.infer<typeof schema>;

export const outboxConfig = registerAs('outbox', (): OutboxConfig => {
  return schema.parse({
    pollIntervalMs: process.env.OUTBOX_POLL_INTERVAL_MS,
    batchSize: process.env.OUTBOX_BATCH_SIZE,
    staleTimeoutMs: process.env.OUTBOX_STALE_TIMEOUT_MS,
    pollerEnabled: process.env.OUTBOX_POLLER_ENABLED,
  });
});
