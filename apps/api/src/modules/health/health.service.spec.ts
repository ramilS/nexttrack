import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { SearchEngineService } from '@/modules/search/engine/search-engine.service';

describe('HealthService', () => {
  let service: HealthService;

  const prisma = { $queryRaw: jest.fn() };
  const valkeyPing = jest.fn();
  const valkey = { getClient: jest.fn() };
  const searchEngine = { ping: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    valkeyPing.mockResolvedValue('PONG');
    valkey.getClient.mockReturnValue({ ping: valkeyPing });
    searchEngine.ping.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ValkeyService, useValue: valkey },
        { provide: SearchEngineService, useValue: searchEngine },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  describe('readiness', () => {
    it('returns ok with per-check latency when all dependencies are up', async () => {
      const result = await service.readiness();

      expect(result.status).toBe('ok');
      for (const check of [
        result.services.postgres,
        result.services.valkey,
        result.services.searchEngine,
      ]) {
        expect(check.status).toBe('ok');
        expect(check.latencyMs).toEqual(expect.any(Number));
        expect(check.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('reports degraded with latency when a dependency is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const result = await service.readiness();

      expect(result.status).toBe('degraded');
      expect(result.services.postgres).toEqual({
        status: 'down',
        latencyMs: expect.any(Number),
      });
      expect(result.services.valkey.status).toBe('ok');
      expect(result.services.searchEngine.status).toBe('ok');
    });
  });

  describe('aggregate (legacy alias)', () => {
    it('keeps the old flat services shape', async () => {
      const result = await service.aggregate();

      expect(result).toEqual({
        status: 'ok',
        services: { postgres: 'ok', valkey: 'ok', searchEngine: 'ok' },
      });
    });

    it('reports degraded when a dependency is down', async () => {
      searchEngine.ping.mockRejectedValue(new Error('cluster unreachable'));

      const result = await service.aggregate();

      expect(result.status).toBe('degraded');
      expect(result.services.searchEngine).toBe('down');
    });
  });

  describe('single-dependency checks', () => {
    it('returns down (does not throw) when the dependency ping fails', async () => {
      valkeyPing.mockRejectedValue(new Error('NOAUTH'));
      expect(await service.checkValkey()).toBe('down');
    });
  });
});
