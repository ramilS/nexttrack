import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('uses an isolated registry so multiple instances do not collide', () => {
    expect(() => new MetricsService()).not.toThrow();
  });

  it('exposes default process metrics on scrape', async () => {
    const output = await service.getMetrics();

    expect(output).toContain('process_cpu_user_seconds_total');
  });

  it('exposes the prom-client content type', () => {
    expect(service.contentType).toContain('text/plain');
  });

  it('increments http_requests_total with method, route and status labels', async () => {
    service.recordHttpRequest('GET', '/projects/:key', 200, 0.05);
    service.recordHttpRequest('GET', '/projects/:key', 200, 0.07);

    const output = await service.getMetrics();

    expect(output).toContain(
      'http_requests_total{method="GET",route="/projects/:key",status="200"} 2',
    );
  });

  it('observes http_request_duration_seconds with the configured buckets', async () => {
    service.recordHttpRequest('POST', '/issues', 201, 0.3);

    const output = await service.getMetrics();

    expect(output).toContain(
      'http_request_duration_seconds_count{method="POST",route="/issues",status="201"} 1',
    );
    expect(output).toContain(
      'http_request_duration_seconds_sum{method="POST",route="/issues",status="201"} 0.3',
    );
    expect(output).toContain('le="0.01"');
    expect(output).toContain('le="0.25"');
    expect(output).toContain('le="5"');
  });

  it('keeps separate series per status label', async () => {
    service.recordHttpRequest('GET', '/issues', 200, 0.01);
    service.recordHttpRequest('GET', '/issues', 404, 0.01);

    const output = await service.getMetrics();

    expect(output).toContain(
      'http_requests_total{method="GET",route="/issues",status="200"} 1',
    );
    expect(output).toContain(
      'http_requests_total{method="GET",route="/issues",status="404"} 1',
    );
  });
});
