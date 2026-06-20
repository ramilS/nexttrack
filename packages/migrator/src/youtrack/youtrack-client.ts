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
    const fullUrl = url.startsWith('http') ? url : `${this.config.url}${url}`;
    const { data } = await axios.get(fullUrl, {
      responseType: 'stream',
      headers: { Authorization: `Bearer ${this.config.token}` },
      timeout: 120_000,
    });
    return data;
  }
}
