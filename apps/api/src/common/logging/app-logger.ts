import { Logger } from '@nestjs/common';
import { currentRequestContext } from '@/common/context/request-context';

/**
 * Structured fields attached to a log line, rendered as `key=value` pairs.
 *
 * PII policy (see `.claude/rules/nestjs-security.md`): pass identifiers
 * (`userId`, `issueId`, `projectId`), never raw `email`. Include `ip` only on
 * security events where it is investigation-critical (login, token reuse).
 */
export type LogFields = Record<string, unknown>;

/**
 * Thin wrapper over the NestJS `Logger` that:
 *  - prefixes every line with the active request context (`[requestId][user:id]`)
 *    pulled from AsyncLocalStorage, so logs are correlatable across services
 *    without threading ids through call sites;
 *  - renders structured `key=value` fields for grep-friendly incident triage.
 *
 * Use exactly like the framework logger: `new AppLogger(MyService.name)`.
 */
export class AppLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  log(message: string, fields?: LogFields): void {
    this.logger.log(this.decorate(message, fields));
  }

  warn(message: string, fields?: LogFields): void {
    this.logger.warn(this.decorate(message, fields));
  }

  debug(message: string, fields?: LogFields): void {
    this.logger.debug(this.decorate(message, fields));
  }

  verbose(message: string, fields?: LogFields): void {
    this.logger.verbose(this.decorate(message, fields));
  }

  /**
   * `error` keeps the stack trace: pass the caught error as the 2nd argument.
   * A non-`Error` thrown value is surfaced as an `error` field instead.
   */
  error(message: string, error?: unknown, fields?: LogFields): void {
    const stack = error instanceof Error ? error.stack : undefined;
    const merged =
      error !== undefined && !(error instanceof Error)
        ? { ...fields, error }
        : fields;
    this.logger.error(this.decorate(message, merged), stack);
  }

  private decorate(message: string, fields?: LogFields): string {
    const ctx = currentRequestContext();
    const prefix = ctx
      ? `[${ctx.requestId}]${ctx.userId ? `[user:${ctx.userId}]` : ''} `
      : '';
    return prefix + message + formatFields(fields);
  }
}

function formatFields(fields?: LogFields): string {
  if (!fields) return '';
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`);
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      // JSON.stringify returns undefined for values it can't represent;
      // fall back to String() so a field never renders as "key=undefined".
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
