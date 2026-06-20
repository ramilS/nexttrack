import {
  CallHandler,
  ExecutionContext,
  RequestTimeoutException,
} from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { TimeoutInterceptor } from '@/common/interceptors/timeout.interceptor';
import { AppConfig } from '@/config';
import { mockAppConfig } from '@test/helpers';

const TEST_TIMEOUT_MS = 5;
const SLOW_HANDLER_MS = 50;

const testAppConfig: AppConfig = {
  ...mockAppConfig,
  requestTimeoutMs: TEST_TIMEOUT_MS,
};

function buildCallHandler(handle: CallHandler['handle']): CallHandler {
  return { handle };
}

describe('TimeoutInterceptor', () => {
  let interceptor: TimeoutInterceptor;
  const context = {} as ExecutionContext;

  beforeEach(() => {
    interceptor = new TimeoutInterceptor(testAppConfig);
  });

  it('passes fast responses through unchanged', async () => {
    const next = buildCallHandler(() => of('fast-result'));

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('fast-result');
  });

  it('throws RequestTimeoutException when the handler exceeds the timeout', async () => {
    const next = buildCallHandler(() =>
      of('slow-result').pipe(delay(SLOW_HANDLER_MS)),
    );

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBeInstanceOf(RequestTimeoutException);
  });

  it('propagates non-timeout errors unchanged', async () => {
    const handlerError = new Error('handler failure');
    const next = buildCallHandler(() => throwError(() => handlerError));

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(handlerError);
  });
});
