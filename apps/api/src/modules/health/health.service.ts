import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { SearchEngineService } from '@/modules/search/engine/search-engine.service';
import { AppLogger } from '@/common/logging/app-logger';

export type ServiceStatus = 'ok' | 'down';

export interface ServiceCheck {
  status: ServiceStatus;
  latencyMs: number;
}

export interface ReadinessHealth {
  status: 'ok' | 'degraded';
  services: {
    postgres: ServiceCheck;
    valkey: ServiceCheck;
    searchEngine: ServiceCheck;
  };
}

export interface AggregateHealth {
  status: 'ok' | 'degraded';
  services: {
    postgres: ServiceStatus;
    valkey: ServiceStatus;
    searchEngine: ServiceStatus;
  };
}

/**
 * Owns the dependency probes, latency timing and status aggregation so the
 * controller stays a thin transport layer (it is the only place infra clients
 * — Prisma/Valkey/SearchEngine — would otherwise be injected).
 */
@Injectable()
export class HealthService {
  private readonly logger = new AppLogger(HealthService.name);

  constructor(
    private prisma: PrismaService,
    private valkey: ValkeyService,
    private searchEngine: SearchEngineService,
  ) {}

  /** Aggregate dependency checks with per-check latency. */
  async readiness(): Promise<ReadinessHealth> {
    const [postgres, valkey, searchEngine] = await Promise.all([
      this.timedCheck(() => this.checkPostgres()),
      this.timedCheck(() => this.checkValkey()),
      this.timedCheck(() => this.checkSearchEngine()),
    ]);

    const allOk =
      postgres.status === 'ok' &&
      valkey.status === 'ok' &&
      searchEngine.status === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      services: { postgres, valkey, searchEngine },
    };
  }

  /** Legacy flat shape — kept as an alias for existing consumers. */
  async aggregate(): Promise<AggregateHealth> {
    const ready = await this.readiness();
    return {
      status: ready.status,
      services: {
        postgres: ready.services.postgres.status,
        valkey: ready.services.valkey.status,
        searchEngine: ready.services.searchEngine.status,
      },
    };
  }

  async checkPostgres(): Promise<ServiceStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (err) {
      this.logger.warn(
        `Postgres health check failed: ${(err as Error).message}`,
      );
      return 'down';
    }
  }

  async checkValkey(): Promise<ServiceStatus> {
    try {
      await this.valkey.getClient().ping();
      return 'ok';
    } catch (err) {
      this.logger.warn(`Valkey health check failed: ${(err as Error).message}`);
      return 'down';
    }
  }

  async checkSearchEngine(): Promise<ServiceStatus> {
    try {
      await this.searchEngine.ping();
      return 'ok';
    } catch (err) {
      this.logger.warn(
        `Search engine health check failed: ${(err as Error).message}`,
      );
      return 'down';
    }
  }

  private async timedCheck(
    check: () => Promise<ServiceStatus>,
  ): Promise<ServiceCheck> {
    const startedAt = Date.now();
    const status = await check();
    return { status, latencyMs: Date.now() - startedAt };
  }
}
