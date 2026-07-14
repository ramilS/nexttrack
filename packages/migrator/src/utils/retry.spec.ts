import { afterEach, describe, expect, it, vi } from 'vitest';
import { retry } from './retry';

describe('retry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws a rejected permanent error immediately', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const error = new Error('permanent');
    const operation = vi.fn().mockRejectedValue(error);
    const shouldRetry = vi.fn().mockReturnValue(false);

    await expect(
      retry(operation, { attempts: 3, delay: 100, backoff: 2, shouldRetry }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(error, 1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('makes attempts total calls when errors remain transient', async () => {
    vi.useFakeTimers();
    const error = new Error('transient');
    const operation = vi.fn().mockRejectedValue(error);
    const promise = retry(operation, {
      attempts: 3,
      delay: 100,
      backoff: 2,
      shouldRetry: () => true,
    });

    const assertion = expect(promise).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('applies symmetric jitter around the exponential delay', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const operation = vi.fn().mockRejectedValue(new Error('transient'));
    const promise = retry(operation, {
      attempts: 3,
      delay: 100,
      backoff: 2,
      jitter: 0.2,
    });

    const assertion = expect(promise).rejects.toThrow('transient');
    await vi.runAllTimersAsync();
    await assertion;

    expect(vi.getTimerCount()).toBe(0);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 80);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 240);
  });

  it.each([
    { attempts: 0, delay: 100, backoff: 2 },
    { attempts: 1.5, delay: 100, backoff: 2 },
    { attempts: 1, delay: -1, backoff: 2 },
    { attempts: 1, delay: 100, backoff: -1 },
    { attempts: 1, delay: 100, backoff: 2, jitter: -0.1 },
    { attempts: 1, delay: 100, backoff: 2, jitter: 1.1 },
  ])('rejects invalid options %#', async (options) => {
    await expect(retry(async () => 'unused', options)).rejects.toThrow(
      'Invalid retry options',
    );
  });
});
