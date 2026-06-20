import { getE2eEnv } from './env';

interface LoginResponse {
  data: {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  };
}

interface ApiClientOptions {
  accessToken?: string;
}

function extractAccessTokenFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // fetch's Headers.get('set-cookie') returns a comma-joined string of all cookies.
  const cookies = setCookie.split(/,(?=\s*\w+=)/);
  for (const cookie of cookies) {
    const match = cookie.match(/(?:^|;)\s*access_token=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export class ApiClient {
  private readonly baseUrl: string;
  private accessToken?: string;

  constructor(options?: ApiClientOptions) {
    this.baseUrl = `${getE2eEnv().apiUrl}/api`;
    this.accessToken = options?.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `API ${method} ${path} failed (${response.status}): ${text}`,
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await response.json()) as T;
    }

    // Non-JSON 2xx responses (e.g. 204 No Content) — return void-compatible
    return undefined as unknown as T;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    // /auth/login returns { user } in body; access_token is delivered as an
    // httpOnly cookie. We pull it out of Set-Cookie and use it as a Bearer
    // header for subsequent API calls.
    const url = `${this.baseUrl}/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API POST /auth/login failed (${response.status}): ${text}`);
    }

    const token = extractAccessTokenFromSetCookie(response.headers.get('set-cookie'));
    if (!token) {
      throw new Error('access_token cookie missing from login response');
    }
    this.accessToken = token;

    return (await response.json()) as LoginResponse;
  }

  async createProject(data: {
    name: string;
    key: string;
    description?: string;
  }): Promise<{ data: { id: string; key: string; name: string } }> {
    return this.request('POST', '/projects', data);
  }

  async createIssue(
    projectKey: string,
    data: { title: string; type?: string; priority?: string },
  ): Promise<{ data: { id: string; number: number; title: string } }> {
    return this.request('POST', `/projects/${projectKey}/issues`, data);
  }

  async getProjects(): Promise<{
    data: { items: Array<{ id: string; key: string; name: string }> };
  }> {
    return this.request('GET', '/projects');
  }

  async getIssues(projectKey: string): Promise<{
    data: { items: Array<{ id: string; number: number; title: string }> };
  }> {
    return this.request('GET', `/projects/${projectKey}/issues`);
  }
}
