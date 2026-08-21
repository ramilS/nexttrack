import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';

export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (data && data.items !== undefined && data.meta !== undefined) {
          return data;
        }

        return {
          data,
          meta: {
            timestamp: new Date().toISOString(),
            ...this.extraMeta(context),
          },
        };
      }),
    );
  }

  /**
   * A handler can't return `{ data, meta }` itself to add response-level meta
   * (e.g. "this create deduplicated onto an existing issue") — the return
   * value must stay the plain entity, because `ZodSerializerInterceptor` runs
   * BEFORE this interceptor and parses that raw return against the entity's
   * response schema; wrapping it there would fail that parse. Instead a
   * handler with `@Res({ passthrough: true })` stashes the extra fields on
   * `res.locals.meta`, and this is the one place that reads them back in.
   * HTTP-only: WS/RPC execution contexts have no `Response` to read.
   */
  private extraMeta(context: ExecutionContext): Record<string, unknown> | undefined {
    if (context.getType() !== 'http') return undefined;
    const res = context.switchToHttp().getResponse<Response>();
    return res?.locals?.meta as Record<string, unknown> | undefined;
  }
}
