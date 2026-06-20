import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { z } from 'zod';
import { envBoolean } from './config/helpers';

// This bootstrap runs as the first import in main.ts, BEFORE the Nest DI
// container exists, so it cannot use @Inject(config.KEY). It is therefore the
// SINGLE source of truth for OTel env — validated here with the same Zod
// helpers the rest of the config uses (fail-fast on malformed values, exactly
// like any other config). There is deliberately no ConfigModule `otelConfig`:
// nothing inside DI consumes it, so a parallel registerAs would be dead code.
//
// The OTLP exporter reads OTEL_EXPORTER_OTLP_ENDPOINT itself (W3C/OTLP spec:
// it is the BASE — the SDK appends /v1/traces). Default base resolves to
// http://localhost:4318/v1/traces, which matches the local Jaeger service.
const schema = z.object({
  enabled: envBoolean(false),
  serviceName: z.string().min(1).default('nexttrack-api'),
  sampleRatio: z.coerce.number().min(0).max(1).default(1),
});

const config = schema.parse({
  enabled: process.env.OTEL_ENABLED,
  serviceName: process.env.OTEL_SERVICE_NAME,
  sampleRatio: process.env.OTEL_SAMPLE_RATIO,
});

if (config.enabled) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    // ParentBased: honour the sampled flag carried in a restored/upstream
    // traceparent (the whole point of bridging the outbox gap), and only fall
    // back to the ratio sampler for brand-new root spans.
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.sampleRatio),
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new IORedisInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  try {
    sdk.start();
    // console (not the Nest logger): tracing boots before the logger exists
    console.log('[otel] tracing started');
  } catch (err) {
    // A down collector / exporter is a runtime condition, not misconfig —
    // observability must never crash the app.
    // console (not the Nest logger): tracing boots before the logger exists
    console.error('[otel] failed to start tracing', err);
  }

  // Flush buffered spans before exit. Awaited so the BatchSpanProcessor can
  // export in-flight batches; exit itself is left to Nest's shutdown hooks.
  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch {
      // already shutting down / exporter gone — nothing actionable
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  process.once('beforeExit', shutdown);
}
