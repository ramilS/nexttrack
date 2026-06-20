import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { NotFoundError } from '@/common/errors/domain.errors';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

interface HttpContextOptions {
  method?: string;
  routePath?: string;
  statusCode?: number;
  type?: string;
}

function createHttpContext(options: HttpContextOptions = {}): ExecutionContext {
  const request = {
    method: options.method ?? 'GET',
    route:
      options.routePath === undefined ? undefined : { path: options.routePath },
  };
  const response = { statusCode: options.statusCode ?? 200 };

  return {
    getType: () => options.type ?? 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsInterceptor', () => {
  let metricsService: MetricsService;
  let recordSpy: jest.SpyInstance;
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    metricsService = new MetricsService();
    recordSpy = jest.spyOn(metricsService, 'recordHttpRequest');
    interceptor = new MetricsInterceptor(metricsService);
  });

  it('records method, route pattern, status and duration on success', (done) => {
    const context = createHttpContext({
      method: 'POST',
      routePath: '/projects/:key/issues',
      statusCode: 201,
    });
    const handler = { handle: () => of({ id: 'issue-1' }) };

    interceptor.intercept(context, handler).subscribe({
      next: (result) => {
        expect(result).toEqual({ id: 'issue-1' });
      },
      complete: () => {
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy).toHaveBeenCalledWith(
          'POST',
          '/projects/:key/issues',
          201,
          expect.any(Number),
        );
        const durationSeconds = recordSpy.mock.calls[0][3] as number;
        expect(durationSeconds).toBeGreaterThanOrEqual(0);
        done();
      },
    });
  });

  it('records the HttpException status and rethrows on error', (done) => {
    const context = createHttpContext({ routePath: '/issues/:id' });
    const handler = {
      handle: () => throwError(() => new NotFoundException()),
    };

    interceptor.intercept(context, handler).subscribe({
      error: (err: unknown) => {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(recordSpy).toHaveBeenCalledWith(
          'GET',
          '/issues/:id',
          404,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('records the mapped status for DomainError and rethrows', (done) => {
    const context = createHttpContext({ routePath: '/issues/:id' });
    const handler = {
      handle: () => throwError(() => new NotFoundError('ISSUE_NOT_FOUND')),
    };

    interceptor.intercept(context, handler).subscribe({
      error: (err: unknown) => {
        expect(err).toBeInstanceOf(NotFoundError);
        expect(recordSpy).toHaveBeenCalledWith(
          'GET',
          '/issues/:id',
          404,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('records status 500 for non-HTTP exceptions', (done) => {
    const context = createHttpContext({ routePath: '/issues' });
    const handler = {
      handle: () => throwError(() => new Error('boom')),
    };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(recordSpy).toHaveBeenCalledWith(
          'GET',
          '/issues',
          500,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('falls back to "unknown" route when no route is matched', (done) => {
    const context = createHttpContext({ statusCode: 404 });
    const handler = { handle: () => of(null) };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(recordSpy).toHaveBeenCalledWith(
          'GET',
          'unknown',
          404,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('skips non-HTTP execution contexts', (done) => {
    const context = createHttpContext({ type: 'ws' });
    const handler = { handle: () => of('event') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(recordSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
