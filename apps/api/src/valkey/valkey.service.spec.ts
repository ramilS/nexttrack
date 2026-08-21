import type Redis from 'ioredis';
import { ValkeyService } from './valkey.service';

interface FakeRedisEntry {
  value: string;
  ttlSeconds: number | null;
}

/**
 * Runs the *actual* script string `ValkeyService.incrementWithExpiry` sends
 * to `eval` against a seeded in-memory key — not a check on the script's
 * source text. Implements real Redis INCR/TTL/EXPIRE semantics from scratch
 * (TTL: -2 missing key, -1 no expiry, else seconds remaining) so the test
 * exercises the script's actual branching: whether the captured `if` line
 * checks TTL at all determines whether a stuck key (count > 1, no TTL)
 * ever gets its expiry armed.
 */
function runIncrementWithExpiryScript(
  script: string,
  store: Map<string, FakeRedisEntry>,
  key: string,
  ttlArg: number,
): number {
  const call = (command: string): number => {
    const entry = store.get(key);
    switch (command) {
      case 'INCR': {
        const next = (entry ? Number(entry.value) : 0) + 1;
        store.set(key, { value: String(next), ttlSeconds: entry?.ttlSeconds ?? null });
        return next;
      }
      case 'TTL':
        return entry ? entry.ttlSeconds ?? -1 : -2;
      case 'EXPIRE': {
        if (entry) entry.ttlSeconds = ttlArg;
        return entry ? 1 : 0;
      }
      default:
        throw new Error(`fake redis: unsupported command ${command}`);
    }
  };

  let count = 0;
  let armExpiry = false;
  for (const line of script.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('local count = redis.call(\'INCR\'')) {
      count = call('INCR');
    } else if (line.startsWith('if ')) {
      const checksTtl = line.includes("redis.call('TTL', KEYS[1])");
      armExpiry = count === 1 || (checksTtl && call('TTL') < 0);
    } else if (line.startsWith("redis.call('EXPIRE'")) {
      if (armExpiry) call('EXPIRE');
    }
    // 'end' / 'return count' — no store effect
  }
  return count;
}

describe('ValkeyService atomic commands', () => {
  let service: ValkeyService;
  let client: { set: jest.Mock; eval: jest.Mock };

  beforeEach(() => {
    client = {
      set: jest.fn(),
      eval: jest.fn(),
    };
    service = Object.create(ValkeyService.prototype) as ValkeyService;
    (service as unknown as { client: Redis }).client = client as unknown as Redis;
  });

  it.each([
    ['OK', true],
    [null, false],
  ])('maps SET NX result %p to %p', async (result, expected) => {
    client.set.mockResolvedValue(result);

    await expect(service.setIfAbsent('timer:user-1', 'payload', 60)).resolves.toBe(expected);

    expect(client.set).toHaveBeenCalledWith('timer:user-1', 'payload', 'EX', 60, 'NX');
  });

  it.each([
    ['payload', 'payload'],
    [0, null],
  ])('maps compareAndDeleteByJsonField eval result %p to %p', async (result, expected) => {
    client.eval.mockResolvedValue(result);

    await expect(
      service.compareAndDeleteByJsonField('timer:user-1', 'timerId', 'timer-1'),
    ).resolves.toBe(expected);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DEL', KEYS[1])"),
      1,
      'timer:user-1',
      'timerId',
      'timer-1',
    );

    const script = client.eval.mock.calls[0][0] as string;
    expect(script).toContain("local value = redis.call('GET', KEYS[1])");
    expect(script).toContain('pcall(cjson.decode, value)');
    expect(script).toContain("type(decoded) ~= 'table'");
    expect(script).toContain('decoded[ARGV[1]] ~= ARGV[2]');
    expect(script).toContain('return value');
  });

  it.each([
    [1, true],
    [0, false],
  ])('maps compareAndSet eval result %p to %p', async (result, expected) => {
    client.eval.mockResolvedValue(result);

    await expect(
      service.compareAndSet('timer:user-1', 'snapshot', 'updated-payload', 60),
    ).resolves.toBe(expected);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])"),
      1,
      'timer:user-1',
      'snapshot',
      'updated-payload',
      60,
    );
    expect(client.eval.mock.calls[0][0]).toContain("redis.call('GET', KEYS[1]) == ARGV[1]");
  });

  it.each([
    ['3', 3],
    [3, 3],
  ])('maps incrementWithExpiry eval result %p to %p', async (result, expected) => {
    client.eval.mockResolvedValue(result);

    await expect(service.incrementWithExpiry('apikeyauth:fail:203.0.113.7', 60)).resolves.toBe(
      expected,
    );

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      'apikeyauth:fail:203.0.113.7',
      60,
    );
  });

  it('arms the expiry inside the same script as the increment, not as a separate call', async () => {
    client.eval.mockResolvedValue(1);

    await service.incrementWithExpiry('apikeyauth:fail:203.0.113.7', 60);

    // The bug this guards against: incr() succeeding and a *separate*
    // expire() call failing/never running leaves the key with no TTL —
    // a permanent lockout. Asserting both redis.call lines live inside the
    // one script proves the increment and the expiry commit atomically
    // together, not as two independently-failable round trips.
    const script = client.eval.mock.calls[0][0] as string;
    expect(script).toContain("local count = redis.call('INCR', KEYS[1])");
    expect(script).toContain("redis.call('EXPIRE', KEYS[1], ARGV[1])");
    expect(client.eval).toHaveBeenCalledTimes(1);
  });

  describe('self-healing TTL', () => {
    let store: Map<string, FakeRedisEntry>;

    beforeEach(() => {
      store = new Map();
      client.eval.mockImplementation((async (
        script: string,
        _numKeys: number,
        key: string,
        ttlArg: number,
      ) => runIncrementWithExpiryScript(script, store, key, Number(ttlArg))) as never);
    });

    it('arms the expiry for a key stuck with count > 1 and no TTL (restored dump, stray SET, past bug)', async () => {
      const key = 'apikeyauth:fail:203.0.113.7';
      store.set(key, { value: '5', ttlSeconds: null });

      await service.incrementWithExpiry(key, 60);

      expect(store.get(key)?.ttlSeconds).toBe(60);
    });

    it('does not extend the TTL of a key that already has one (fixed window, not sliding)', async () => {
      const key = 'apikeyauth:fail:203.0.113.7';
      store.set(key, { value: '5', ttlSeconds: 30 });

      await service.incrementWithExpiry(key, 60);

      expect(store.get(key)?.ttlSeconds).toBe(30);
    });

    it('arms the expiry on the very first increment of a brand-new key', async () => {
      const key = 'apikeyauth:fail:203.0.113.7';

      await service.incrementWithExpiry(key, 60);

      expect(store.get(key)?.ttlSeconds).toBe(60);
    });
  });
});
