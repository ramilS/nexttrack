import axios, { AxiosInstance } from 'axios';
import { Readable } from 'stream';
import { retry } from '../utils/retry';
import { RateLimiter } from '../utils/rate-limiter';

export class YouTrackClient {
  private readonly http: AxiosInstance;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly config: {
      url: string;
      token: string;
      rateLimit: number;
    },
  ) {
    this.http = axios.create({
      baseURL: `${config.url.replace(/\/$/, '')}/api`,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  async *paginate<T>(
    endpoint: string,
    params: Record<string, string>,
    pageSize = 100,
  ): AsyncGenerator<T[]> {
    let skip = 0;
    while (true) {
      const response = await this.get<T[]>(endpoint, {
        ...params,
        $skip: skip.toString(),
        $top: pageSize.toString(),
      });
      if (response.length === 0) break;
      yield response;
      if (response.length < pageSize) break;
      skip += pageSize;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    await this.rateLimiter.acquire();
    return retry(
      async () => {
        const { data } = await this.http.get<T>(endpoint, { params });
        return data;
      },
      { attempts: 3, delay: 1000, backoff: 2 },
    );
  }

  async downloadAttachment(url: string): Promise<Readable> {
    await this.rateLimiter.acquire();
    // YouTrack's attachment `url` is root-relative and already includes the
    // instance context path (e.g. "/youtrack/api/files/…"). Prepend only the
    // ORIGIN, not config.url — the latter carries the same context path, so
    // concatenating doubles it ("/youtrack/youtrack/…") → 404 → YouTrack serves
    // its SPA HTML shell (HTTP 200, text/html), which then gets stored as the
    // "file". Prepending the origin keeps a single context path.
    const fullUrl = url.startsWith('http')
      ? url
      : `${new URL(this.config.url).origin}${url}`;
    const { data, headers } = await axios.get(fullUrl, {
      responseType: 'stream',
      headers: { Authorization: `Bearer ${this.config.token}` },
      timeout: 120_000,
    });
    // Defence in depth: a wrong URL / expired signature returns the HTML app
    // shell with 200. Never store that as a binary attachment — fail loudly so
    // it surfaces as a recorded error instead of a 0×0 "image".
    const contentType = String(headers['content-type'] ?? '');
    if (contentType.includes('text/html')) {
      throw new Error(
        `Attachment download returned HTML (not the file) from ${fullUrl} — ` +
          `content-type=${contentType}`,
      );
    }
    return data;
  }
}
