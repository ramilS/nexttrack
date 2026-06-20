import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { appConfig } from '@/config';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.app.requestTimeoutMs),
      catchError((err: unknown) =>
        throwError(() =>
          err instanceof TimeoutError ? new RequestTimeoutException() : err,
        ),
      ),
    );
  }
}
