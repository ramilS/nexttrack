import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  HealthService,
  ServiceStatus,
  AggregateHealth,
  ReadinessHealth,
} from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Legacy aggregate shape — kept as alias for existing consumers. */
  @Public()
  @Get()
  health(): Promise<AggregateHealth> {
    return this.healthService.aggregate();
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
  ready(): Promise<ReadinessHealth> {
    return this.healthService.readiness();
  }

  @Public()
  @Get('db')
  dbHealth() {
    return this.probe(this.healthService.checkPostgres(), 'postgres', 'Postgres');
  }

  @Public()
  @Get('valkey')
  valkeyHealth() {
    return this.probe(this.healthService.checkValkey(), 'valkey', 'Valkey');
  }

  @Public()
  @Get('es')
  esHealth() {
    return this.probe(
      this.healthService.checkElasticsearch(),
      'elasticsearch',
      'Elasticsearch',
    );
  }

  /** Single-dependency probe: 200 when up, 503 (transport) when down. */
  private async probe(
    check: Promise<ServiceStatus>,
    service: string,
    label: string,
  ): Promise<{ status: 'ok'; service: string }> {
    if ((await check) === 'down') {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: `${label} is unavailable`,
      });
    }
    return { status: 'ok', service };
  }
}
