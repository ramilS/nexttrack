export interface RetryOptions {
  attempts: number;
  delay: number;
  backoff: number;
  jitter?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { attempts: 3, delay: 1000, backoff: 2 },
): Promise<T> {
  validateOptions(options);
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === options.attempts) break;
      if (options.shouldRetry?.(err, attempt) === false) throw err;

      const jitter = options.jitter ?? 0;
      const jitterFactor = 1 - jitter + Math.random() * jitter * 2;
      const waitMs = Math.round(
        options.delay * Math.pow(options.backoff, attempt - 1) * jitterFactor,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

function validateOptions(options: RetryOptions): void {
  const valid =
    Number.isInteger(options.attempts) &&
    options.attempts >= 1 &&
    Number.isFinite(options.delay) &&
    options.delay >= 0 &&
    Number.isFinite(options.backoff) &&
    options.backoff >= 0 &&
    (options.jitter === undefined ||
      (Number.isFinite(options.jitter) &&
        options.jitter >= 0 &&
        options.jitter <= 1));

  if (!valid) throw new Error('Invalid retry options');
}
