import { apiClient } from './client';
import type { CurrentUser } from '@/lib/stores/auth.store';
import type {
  LoginInput,
  AcceptInviteInput,
  AuthMethodsResponse,
  AuthResponse,
  InviteValidation,
  PublicSsoProvider,
} from '@repo/shared/schemas';

// Request/response contracts come from the shared schemas (single source of
// truth with the API), re-exported under this module's existing names.
export type LoginRequest = LoginInput;
export type AcceptInviteRequest = AcceptInviteInput;
export type SsoProviderInfo = PublicSsoProvider;

export const authApi = {
  getAuthMethods: () =>
    apiClient.get<AuthMethodsResponse>('/auth/methods'),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  refresh: () =>
    apiClient.post<void>('/auth/refresh'),

  logout: () =>
    apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get<CurrentUser>('/users/me'),

  acceptInvite: (data: AcceptInviteRequest) =>
    apiClient.post<AuthResponse>('/auth/invite/accept', data),

  getInvite: (token: string) =>
    apiClient.get<InviteValidation>(`/auth/invite/validate/${token}`),

  ssoRedirect: (provider: string) =>
    `${apiClient.defaults.baseURL}/auth/sso/${provider}`,
};
