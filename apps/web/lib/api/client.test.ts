import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import type {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * The interceptor in client.ts is registered against the instance returned by
 * `axios.create()`, and it both (a) calls `axios.post(...)` to hit /auth/refresh
 * and (b) re-invokes the instance as a function `apiClient(originalRequest)` to
 * replay a request. To exercise the real interceptor logic in isolation we mock
 * the `axios` module:
 *
 *  - `axios.create()` returns a callable mock instance whose
 *    `interceptors.response.use(...)` captures the (onFulfilled, onRejected)
 *    handlers so the test can invoke them directly.
 *  - `axios.post` is the refresh call, controlled per-test.
 *
 * The captured handlers are then driven with synthetic responses/errors.
 */

type FulfilledHandler = (
  response: AxiosResponse,
) => AxiosResponse | Promise<AxiosResponse>;
type RejectedHandler = (error: AxiosError) => Promise<unknown>;

const { capturedHandlers, instanceCall, axiosPost } = vi.hoisted(() => ({
  capturedHandlers: {} as {
    onFulfilled?: FulfilledHandler;
    onRejected?: RejectedHandler;
  },
  instanceCall: vi.fn() as Mock,
  axiosPost: vi.fn() as Mock,
}));

vi.mock('axios', () => {
  const interceptorsUse = (
    onFulfilled: FulfilledHandler,
    onRejected: RejectedHandler,
  ) => {
    capturedHandlers.onFulfilled = onFulfilled;
    capturedHandlers.onRejected = onRejected;
  };

  // The instance must be callable: client.ts replays via `apiClient(config)`.
  const createInstance = () => {
    const instance = ((config: unknown) =>
      instanceCall(config)) as unknown as {
      interceptors: { response: { use: typeof interceptorsUse } };
    };
    instance.interceptors = { response: { use: interceptorsUse } };
    return instance;
  };

  const axiosMock = {
    create: vi.fn(() => createInstance()),
    post: axiosPost,
  };

  return { default: axiosMock };
});

const { logoutSpy } = vi.hoisted(() => ({ logoutSpy: vi.fn() }));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: {
    getState: () => ({ logout: logoutSpy }),
  },
}));

// Import AFTER mocks so the interceptor registers against the mocked axios.
import { bumpTokenVersion } from './client';

function getOnRejected(): RejectedHandler {
  if (!capturedHandlers.onRejected) {
    throw new Error('error interceptor was not registered');
  }
  return capturedHandlers.onRejected;
}

function getOnFulfilled(): FulfilledHandler {
  if (!capturedHandlers.onFulfilled) {
    throw new Error('fulfilled interceptor was not registered');
  }
  return capturedHandlers.onFulfilled;
}

function makeAxiosError(
  status: number | undefined,
  url: string,
  extra: Partial<InternalAxiosRequestConfig> = {},
): AxiosError {
  const config = { url, headers: {}, ...extra } as InternalAxiosRequestConfig;
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    config,
    response:
      status === undefined
        ? undefined
        : ({ status, data: {}, config } as AxiosResponse),
    toJSON: () => ({}),
  } as AxiosError;
}

const ORIGINAL_LOCATION = window.location;

function setLocation(pathname: string, search = ''): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname,
      search,
      href: 'http://localhost:3000' + pathname + search,
    } as unknown as Location,
  });
}

describe('apiClient interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: replaying a request resolves to a sentinel response.
    instanceCall.mockResolvedValue({ data: 'replayed' });
    setLocation('/dashboard');
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
  });

  describe('unwrapEnvelope (fulfilled handler)', () => {
    it('unwraps a { data, meta } envelope to its data payload', () => {
      const onFulfilled = getOnFulfilled();
      const inner = { id: '1', title: 'Issue' };
      const response = {
        data: { data: inner, meta: { total: 1 } },
      } as AxiosResponse;

      const result = onFulfilled(response) as AxiosResponse;

      expect(result.data).toEqual(inner);
    });

    it('leaves a paginated { items, ... } body untouched', () => {
      const onFulfilled = getOnFulfilled();
      const body = { items: [{ id: '1' }], data: [], meta: { total: 1 } };
      const response = { data: body } as AxiosResponse;

      const result = onFulfilled(response) as AxiosResponse;

      expect(result.data).toBe(body);
    });

    it('leaves a non-enveloped plain object untouched', () => {
      const onFulfilled = getOnFulfilled();
      const body = { id: '1', title: 'Issue' };
      const response = { data: body } as AxiosResponse;

      const result = onFulfilled(response) as AxiosResponse;

      expect(result.data).toBe(body);
    });

    it('leaves a null body untouched', () => {
      const onFulfilled = getOnFulfilled();
      const response = { data: null } as unknown as AxiosResponse;

      const result = onFulfilled(response) as AxiosResponse;

      expect(result.data).toBeNull();
    });

    it('does not unwrap when only data (no meta) is present', () => {
      const onFulfilled = getOnFulfilled();
      const body = { data: { id: '1' } };
      const response = { data: body } as AxiosResponse;

      const result = onFulfilled(response) as AxiosResponse;

      expect(result.data).toBe(body);
    });
  });

  describe('pass-through (non-401 / excluded cases)', () => {
    it('rejects non-401 errors without attempting refresh', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(500, '/issues');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
      expect(instanceCall).not.toHaveBeenCalled();
    });

    it('rejects a network error (no response) without refresh', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(undefined, '/issues');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('does not refresh on 401 from /auth/login (avoids infinite loop)', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(401, '/auth/login');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('does not refresh on 401 from /auth/register', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(401, '/auth/register');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('does not refresh on 401 from /auth/refresh (prevents refresh-retry cycle)', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(401, '/auth/refresh');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('does not retry when _retry is already set (no re-entry / infinite retry)', async () => {
      const onRejected = getOnRejected();
      const error = makeAxiosError(401, '/issues', { _retry: true } as Partial<
        InternalAxiosRequestConfig
      >);

      await expect(onRejected(error)).rejects.toBe(error);
      expect(axiosPost).not.toHaveBeenCalled();
    });
  });

  describe('successful refresh', () => {
    it('triggers a single refresh and replays the original request', async () => {
      const onRejected = getOnRejected();
      axiosPost.mockResolvedValueOnce({ data: {} });
      const error = makeAxiosError(401, '/issues');

      const result = await onRejected(error);

      expect(axiosPost).toHaveBeenCalledTimes(1);
      expect(axiosPost).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        {},
        { withCredentials: true },
      );
      expect(instanceCall).toHaveBeenCalledTimes(1);
      expect(instanceCall).toHaveBeenCalledWith(error.config);
      expect(result).toEqual({ data: 'replayed' });
    });

    it('marks the original request with _retry before replaying', async () => {
      const onRejected = getOnRejected();
      axiosPost.mockResolvedValueOnce({ data: {} });
      const error = makeAxiosError(401, '/issues');

      await onRejected(error);

      expect(
        (error.config as InternalAxiosRequestConfig & { _retry?: boolean })
          ._retry,
      ).toBe(true);
    });

    it('dispatches auth:token-refreshed on successful refresh (for socket reconnect)', async () => {
      const onRejected = getOnRejected();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      axiosPost.mockResolvedValueOnce({ data: {} });
      const error = makeAxiosError(401, '/issues');

      await onRejected(error);

      const dispatched = dispatchSpy.mock.calls
        .map((call) => call[0])
        .filter((evt): evt is CustomEvent => evt instanceof CustomEvent);
      expect(
        dispatched.some((evt) => evt.type === 'auth:token-refreshed'),
      ).toBe(true);

      dispatchSpy.mockRestore();
    });

    it('does not logout or redirect on a successful refresh', async () => {
      const onRejected = getOnRejected();
      axiosPost.mockResolvedValueOnce({ data: {} });
      const error = makeAxiosError(401, '/issues');

      await onRejected(error);

      expect(logoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('single-flight refresh queue', () => {
    it('fires refresh ONCE for concurrent 401s and replays all queued requests', async () => {
      const onRejected = getOnRejected();

      // Hold the refresh open so the second 401 arrives while refreshing.
      let resolveRefresh!: (value: unknown) => void;
      axiosPost.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const errorA = makeAxiosError(401, '/issues');
      const errorB = makeAxiosError(401, '/projects');

      const promiseA = onRejected(errorA); // becomes the leader, starts refresh
      const promiseB = onRejected(errorB); // queued behind the leader

      // Only one refresh call despite two concurrent 401s.
      expect(axiosPost).toHaveBeenCalledTimes(1);

      resolveRefresh({ data: {} });

      const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

      // Still exactly one refresh.
      expect(axiosPost).toHaveBeenCalledTimes(1);
      // Both requests were replayed.
      expect(instanceCall).toHaveBeenCalledTimes(2);
      expect(instanceCall).toHaveBeenCalledWith(errorA.config);
      expect(instanceCall).toHaveBeenCalledWith(errorB.config);
      expect(resultA).toEqual({ data: 'replayed' });
      expect(resultB).toEqual({ data: 'replayed' });
    });

    it('rejects all queued requests when the in-flight refresh fails', async () => {
      const onRejected = getOnRejected();

      let rejectRefresh!: (reason: unknown) => void;
      axiosPost.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectRefresh = reject;
        }),
      );

      const refreshError = makeAxiosError(401, '/auth/refresh');
      const errorA = makeAxiosError(401, '/issues');
      const errorB = makeAxiosError(401, '/projects');

      const promiseA = onRejected(errorA);
      const promiseB = onRejected(errorB);

      expect(axiosPost).toHaveBeenCalledTimes(1);

      rejectRefresh(refreshError);

      await expect(promiseA).rejects.toBe(refreshError);
      // Queued request B is rejected with the same refresh error.
      await expect(promiseB).rejects.toBe(refreshError);
      // Neither request gets replayed on refresh failure.
      expect(instanceCall).not.toHaveBeenCalled();
    });
  });

  describe('refresh failure → auth failure handling', () => {
    it('clears auth state and redirects to /login when not already there', async () => {
      const onRejected = getOnRejected();
      setLocation('/dashboard', '?tab=open');
      const refreshError = makeAxiosError(401, '/auth/refresh');
      axiosPost.mockRejectedValueOnce(refreshError);
      const error = makeAxiosError(401, '/issues');

      await expect(onRejected(error)).rejects.toBe(refreshError);

      expect(logoutSpy).toHaveBeenCalledTimes(1);
      expect(window.location.href).toContain('/login');
      expect(window.location.href).toContain(
        encodeURIComponent('/dashboard?tab=open'),
      );
    });

    it('clears auth state but does NOT redirect when already on /login', async () => {
      const onRejected = getOnRejected();
      setLocation('/login', '?redirect=%2Fdashboard');
      const hrefBefore = window.location.href;
      const refreshError = makeAxiosError(401, '/auth/refresh');
      axiosPost.mockRejectedValueOnce(refreshError);
      const error = makeAxiosError(401, '/issues');

      await expect(onRejected(error)).rejects.toBe(refreshError);

      expect(logoutSpy).toHaveBeenCalledTimes(1);
      // href must remain unchanged — no redirect performed while on /login.
      expect(window.location.href).toBe(hrefBefore);
      expect(window.location.pathname).toBe('/login');
    });

    it('clears auth state but does NOT redirect when on a public route (/accept-invite)', async () => {
      const onRejected = getOnRejected();
      setLocation('/accept-invite/some-token');
      const hrefBefore = window.location.href;
      const refreshError = makeAxiosError(401, '/auth/refresh');
      axiosPost.mockRejectedValueOnce(refreshError);
      const error = makeAxiosError(401, '/users/me');

      await expect(onRejected(error)).rejects.toBe(refreshError);

      expect(logoutSpy).toHaveBeenCalledTimes(1);
      // An invitee opening their accept link is a guest by design — bouncing
      // them to /login would break the page for its intended audience.
      expect(window.location.href).toBe(hrefBefore);
      expect(window.location.pathname).toBe('/accept-invite/some-token');
    });

    it('does not dispatch auth:token-refreshed when refresh fails', async () => {
      const onRejected = getOnRejected();
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const refreshError = makeAxiosError(401, '/auth/refresh');
      axiosPost.mockRejectedValueOnce(refreshError);
      const error = makeAxiosError(401, '/issues');

      await expect(onRejected(error)).rejects.toBe(refreshError);

      const dispatched = dispatchSpy.mock.calls
        .map((call) => call[0])
        .filter((evt): evt is CustomEvent => evt instanceof CustomEvent);
      expect(
        dispatched.some((evt) => evt.type === 'auth:token-refreshed'),
      ).toBe(false);

      dispatchSpy.mockRestore();
    });
  });

  describe('token-version race guard', () => {
    it('does not logout when tokenVersion advanced during the failed refresh (stale failure)', async () => {
      const onRejected = getOnRejected();

      // Simulate: while this refresh is in flight, another flow bumps the
      // token version. The stale failure should NOT trigger handleAuthFailure.
      const refreshError = makeAxiosError(401, '/auth/refresh');
      axiosPost.mockImplementationOnce(() => {
        bumpTokenVersion();
        return Promise.reject(refreshError);
      });
      const error = makeAxiosError(401, '/issues');

      await expect(onRejected(error)).rejects.toBe(refreshError);

      // tokenVersion moved on → stale failure must not double-logout.
      expect(logoutSpy).not.toHaveBeenCalled();
    });
  });
});
