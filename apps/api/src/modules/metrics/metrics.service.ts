import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

export const HTTP_LABEL_NAMES = ['method', 'route', 'status'] as const;

const HTTP_DURATION_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export type HttpLabelName = (typeof HTTP_LABEL_NAMES)[number];

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequestDuration: Histogram<HttpLabelName>;
  private readonly httpRequestsTotal: Counter<HttpLabelName>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: HTTP_LABEL_NAMES,
      buckets: HTTP_DURATION_BUCKETS_SECONDS,
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: HTTP_LABEL_NAMES,
      registers: [this.registry],
    });
  }

  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status: String(status) };
    this.httpRequestDuration.observe(labels, durationSeconds);
    this.httpRequestsTotal.inc(labels);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
