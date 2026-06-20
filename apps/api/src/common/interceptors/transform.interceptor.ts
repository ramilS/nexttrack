import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
          },
        };
      }),
    );
  }
}
