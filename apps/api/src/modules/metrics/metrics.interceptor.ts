import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { DomainError } from '@/common/errors/domain.errors';
import { httpStatusOf } from '@/common/errors/domain-error-status';
import { MetricsService } from './metrics.service';

const NANOSECONDS_PER_SECOND = 1e9;

/**
 * Labels every HTTP request with method/route/status and records its duration.
 * Uses the matched route pattern (not the raw URL) to keep label cardinality bounded.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const route = this.resolveRoute(request);
    const startedAt = process.hrtime.bigint();

    const record = (status: number): void => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND;
      this.metrics.recordHttpRequest(method, route, status, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (err: unknown) => record(this.statusOf(err)),
      }),
    );
  }

  private statusOf(err: unknown): HttpStatus {
    if (err instanceof DomainError) return httpStatusOf(err);
    if (err instanceof HttpException) return err.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveRoute(request: Request): string {
    const route: unknown = request.route;
    if (
      route !== null &&
      typeof route === 'object' &&
      'path' in route &&
      typeof route.path === 'string'
    ) {
      return route.path;
    }
    return 'unknown';
  }
}
