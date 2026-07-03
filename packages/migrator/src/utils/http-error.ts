import { AxiosError } from 'axios';

/**
 * Human-readable one-liner for an error, spelling out the HTTP method, full URL,
 * status, and the server's error code/message when it is an axios error — so a
 * failure names WHICH endpoint (source YouTrack vs target NextTrack) failed and
 * WHY, instead of the opaque "Request failed with status code 404".
 */
export function formatHttpError(err: unknown): string {
  const ax = err as AxiosError<Record<string, unknown>> | undefined;
  if (!ax?.isAxiosError) {
    return err instanceof Error ? err.message : String(err);
  }

  const method = ax.config?.method?.toUpperCase() ?? '?';
  const url = `${ax.config?.baseURL ?? ''}${ax.config?.url ?? ''}` || '(unknown url)';

  if (!ax.response) {
    // No response: DNS, connection refused, timeout, etc.
    return `${method} ${url} → no response (${ax.code ?? ax.message})`;
  }

  const body = ax.response.data as
    | {
        error?:
          | { code?: string; message?: unknown; details?: unknown }
          | string;
        message?: unknown;
        error_description?: string;
      }
    | string
    | undefined;

  let code: string | undefined;
  let detail: unknown;
  let details: unknown;
  if (typeof body === 'string') {
    detail = body.slice(0, 300);
  } else if (body) {
    const nested = typeof body.error === 'object' ? body.error : undefined;
    code = nested?.code ?? (typeof body.error === 'string' ? body.error : undefined);
    detail = nested?.message ?? body.message ?? body.error_description;
    // Zod field errors ({ field: [messages] }) — the actionable part of a 400.
    details = nested?.details;
  }

  return (
    `${method} ${url} → ${ax.response.status}` +
    (code ? ` [${code}]` : '') +
    (detail != null ? `: ${stringify(detail)}` : '') +
    (details != null ? ` ${stringify(details)}` : '')
  );
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
