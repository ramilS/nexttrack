import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { ElasticsearchService } from '@/modules/search/elasticsearch/elasticsearch.service';
import { Public } from '@/common/decorators/public.decorator';
import { ErrorCode } from '@repo/shared/error-codes';

type ServiceStatus = 'ok' | 'down';

interface AggregateHealth {
  status: 'ok' | 'degraded';
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    elasticsearch: ServiceStatus;
  };
}

interface ServiceCheck {
  status: ServiceStatus;
  latencyMs: number;
}

interface ReadinessHealth {
  status: 'ok' | 'degraded';
  services: {
    postgres: ServiceCheck;
    redis: ServiceCheck;
    elasticsearch: ServiceCheck;
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private elasticsearch: ElasticsearchService,
  ) {}

  /** Legacy aggregate shape — kept as alias for existing consumers. */
  @Public()
  @Get()
  async health(): Promise<AggregateHealth> {
    const ready = await this.ready();

    return {
      status: ready.status,
      services: {
        postgres: ready.services.postgres.status,
        redis: ready.services.redis.status,
        elasticsearch: ready.services.elasticsearch.status,
      },
    };
  }

  /** Liveness probe — process is up; performs zero dependency checks. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness probe — aggregate dependency checks with per-check latency. */
  @Public()
  @Get('ready')
  async ready(): Promise<ReadinessHealth> {
    const [postgres, redis, elasticsearch] = await Promise.all([
      this.timedCheck(() => this.checkPostgres()),
      this.timedCheck(() => this.checkRedis()),
      this.timedCheck(() => this.checkElasticsearch()),
    ]);

    const allOk =
      postgres.status === 'ok' &&
      redis.status === 'ok' &&
      elasticsearch.status === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      services: { postgres, redis, elasticsearch },
    };
  }

  @Public()
  @Get('db')
  async dbHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.error(
        `Postgres health check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Postgres is unavailable',
      });
    }
    return { status: 'ok', service: 'postgres' };
  }

  @Public()
  @Get('redis')
  async redisHealth() {
    try {
      await this.redis.getClient().ping();
    } catch (err) {
      this.logger.error(
        `Redis health check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Redis is unavailable',
      });
    }
    return { status: 'ok', service: 'redis' };
  }

  @Public()
  @Get('es')
  async esHealth() {
    try {
      await this.elasticsearch.getClient().cluster.health();
    } catch (err) {
      this.logger.error(
        `Elasticsearch health check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Elasticsearch is unavailable',
      });
    }
    return { status: 'ok', service: 'elasticsearch' };
  }

  private async timedCheck(
    check: () => Promise<ServiceStatus>,
  ): Promise<ServiceCheck> {
    const startedAt = Date.now();
    const status = await check();
    return { status, latencyMs: Date.now() - startedAt };
  }

  private async checkPostgres(): Promise<ServiceStatus> {
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

  private async checkRedis(): Promise<ServiceStatus> {
    try {
      await this.redis.getClient().ping();
      return 'ok';
    } catch (err) {
      this.logger.warn(
        `Redis health check failed: ${(err as Error).message}`,
      );
      return 'down';
    }
  }

  private async checkElasticsearch(): Promise<ServiceStatus> {
    try {
      await this.elasticsearch.getClient().cluster.health();
      return 'ok';
    } catch (err) {
      this.logger.warn(
        `Elasticsearch health check failed: ${(err as Error).message}`,
      );
      return 'down';
    }
  }
}
