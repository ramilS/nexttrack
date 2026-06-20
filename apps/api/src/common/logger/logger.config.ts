import { Params } from 'nestjs-pino';
import { trace } from '@opentelemetry/api';

export function createLoggerConfig(nodeEnv: string): Params {
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  return {
    pinoHttp: {
      level:
        process.env.LOG_LEVEL ??
        (isProduction ? 'info' : isTest ? 'silent' : 'debug'),

      // Stamp the active trace ids onto every log line so a log and its trace
      // are joinable. No-ops when no span is active (tracing off / outside a
      // request), leaving log shape unchanged.
      mixin() {
        const span = trace.getActiveSpan();
        if (!span) return {};
        const { traceId, spanId } = span.spanContext();
        return { traceId, spanId };
      },

      ...(isProduction
        ? {
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url,
                remoteAddress: req.remoteAddress,
              }),
              res: (res) => ({ statusCode: res.statusCode }),
            },
          }
        : !isTest && {
            customProps: () => ({ context: 'HTTP' }),
            customSuccessMessage: (req, res, responseTime) =>
              `${req.method} ${req.url} → ${res.statusCode} +${Math.round(responseTime)}ms`,
            customErrorMessage: (req, res, err) =>
              `${req.method} ${req.url} → ${res.statusCode} ${err.message}`,
          }),

      transport: !isProduction && !isTest
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname,req,res,responseTime,context',
              messageFormat: '[{context}] {msg}',
              errorLikeObjectKeys: ['err', 'error'],
              errorProps: 'stack,type',
              levelFirst: false,
            },
          }
        : undefined,
    },
  };
}
