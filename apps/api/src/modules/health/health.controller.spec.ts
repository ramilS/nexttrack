import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { ElasticsearchService } from '@/modules/search/elasticsearch/elasticsearch.service';

describe('HealthController', () => {
  let controller: HealthController;

  const prisma = { $queryRaw: jest.fn() };
  const redisPing = jest.fn();
  const redis = { getClient: jest.fn() };
  const esClusterHealth = jest.fn();
  const elasticsearch = { getClient: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    redisPing.mockResolvedValue('PONG');
    redis.getClient.mockReturnValue({ ping: redisPing });
    esClusterHealth.mockResolvedValue({ status: 'green' });
    elasticsearch.getClient.mockReturnValue({
      cluster: { health: esClusterHealth },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ElasticsearchService, useValue: elasticsearch },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  describe('live', () => {
    it('returns ok without touching any dependency', () => {
      expect(controller.live()).toEqual({ status: 'ok' });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(redis.getClient).not.toHaveBeenCalled();
      expect(elasticsearch.getClient).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('returns ok with per-check latency when all dependencies are up', async () => {
      const result = await controller.ready();

      expect(result.status).toBe('ok');
      for (const check of [
        result.services.postgres,
        result.services.redis,
        result.services.elasticsearch,
      ]) {
        expect(check.status).toBe('ok');
        expect(check.latencyMs).toEqual(expect.any(Number));
        expect(check.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('reports degraded with latency when a dependency is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const result = await controller.ready();

      expect(result.status).toBe('degraded');
      expect(result.services.postgres).toEqual({
        status: 'down',
        latencyMs: expect.any(Number),
      });
      expect(result.services.redis.status).toBe('ok');
      expect(result.services.elasticsearch.status).toBe('ok');
    });
  });

  describe('health (legacy alias)', () => {
    it('keeps the old flat services shape', async () => {
      const result = await controller.health();

      expect(result).toEqual({
        status: 'ok',
        services: { postgres: 'ok', redis: 'ok', elasticsearch: 'ok' },
      });
    });

    it('reports degraded when a dependency is down', async () => {
      esClusterHealth.mockRejectedValue(new Error('cluster unreachable'));

      const result = await controller.health();

      expect(result.status).toBe('degraded');
      expect(result.services.elasticsearch).toBe('down');
    });
  });
});
