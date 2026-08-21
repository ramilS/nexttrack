import { ExecutionContext, Type } from '@nestjs/common';

type HandlerFn = (...args: unknown[]) => unknown;

interface MockContextOptions {
  user?: Record<string, unknown>;
  project?: Record<string, unknown>;
  params?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  handler?: HandlerFn;
  classRef?: Type<unknown>;
  /** `res.locals` of the mocked HTTP response — e.g. `{ meta: {...} }` for
   * TransformInterceptor's extra-meta pass-through. */
  responseLocals?: Record<string, unknown>;
  /** Overrides `getType()` — e.g. `'ws'` to simulate a non-HTTP context. */
  contextType?: string;
}

export function createMockExecutionContext(
  options: MockContextOptions = {},
): ExecutionContext {
  const request: Record<string, unknown> = {
    params: options.params ?? {},
    headers: options.headers ?? {},
  };
  if (options.user) request.user = options.user;
  if (options.project) request.project = options.project;

  const handler = options.handler ?? function testHandler() {};
  const classRef = options.classRef ?? class TestClass {};

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ locals: options.responseLocals ?? {} }),
      getNext: () => jest.fn(),
    }),
    getHandler: () => handler,
    getClass: () => classRef,
    getType: () => options.contextType ?? 'http',
    getArgs: () => [request, {}, jest.fn()],
    getArgByIndex: (index: number) => [request, {}, jest.fn()][index],
    switchToRpc: () => ({ getData: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
  } as unknown as ExecutionContext;
}
