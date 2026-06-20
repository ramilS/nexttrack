export interface RetryOptions {
  attempts: number;
  delay: number;
  backoff: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { attempts: 3, delay: 1000, backoff: 2 },
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === options.attempts) break;

      const waitMs = options.delay * Math.pow(options.backoff, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
