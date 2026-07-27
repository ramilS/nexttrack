import type Redis from 'ioredis';
import { ValkeyService } from './valkey.service';

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
});
