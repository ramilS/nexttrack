import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/lib/stores/auth.store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/** Resolve a server-relative API path (e.g. "/issues/x/attachments/y/download")
 * to a URL usable from the browser (window.open, <img src>, etc.). */
export function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

let tokenVersion = 0;
export function bumpTokenVersion() { tokenVersion++; }

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (error: AxiosError) => void;
}> = [];

function processQueue(error: AxiosError | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(undefined);
  });
  failedQueue = [];
}

function unwrapEnvelope<T>(response: AxiosResponse<T>): AxiosResponse<T> {
  const body = response.data as unknown;
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    'meta' in body &&
    !('items' in body)
  ) {
    response.data = (body as { data: T }).data;
  }
  return response;
}

function buildLoginRedirect(): string {
  const path = window.location.pathname + window.location.search;
  return `/login?redirect=${encodeURIComponent(path)}`;
}

/**
 * Public routes whose normal audience is unauthenticated. A failed `/users/me`
 * → refresh chain here is expected (a guest opening the page), so we clear any
 * stale session but must NOT bounce them to /login — that would break the page
 * for the very users it's meant for (e.g. an invitee opening their accept link).
 */
const PUBLIC_ROUTE_PREFIXES = ['/login', '/accept-invite'];

function handleAuthFailure() {
  if (typeof window === 'undefined') return;

  useAuthStore.getState().logout();

  const onPublicRoute = PUBLIC_ROUTE_PREFIXES.some((prefix) =>
    window.location.pathname.startsWith(prefix),
  );
  if (!onPublicRoute) {
    window.location.href = buildLoginRedirect();
  }
}

apiClient.interceptors.response.use(
  (response) => unwrapEnvelope(response),
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      __tokenVersion?: number;
    };

    const url = originalRequest.url ?? '';
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh');

    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: () => {
            originalRequest._retry = true;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    originalRequest.__tokenVersion = tokenVersion;
    isRefreshing = true;

    try {
      await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      bumpTokenVersion();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:token-refreshed'));
      }
      processQueue(null);
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as AxiosError);
      if (originalRequest.__tokenVersion === tokenVersion) {
        handleAuthFailure();
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
