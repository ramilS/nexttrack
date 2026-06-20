import { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('responds with the registry payload and prom-client content type', async () => {
    const metricsService = new MetricsService();
    const controller = new MetricsController(metricsService);
    const res = {
      set: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;

    await controller.getMetrics(res);

    expect(res.set).toHaveBeenCalledWith(
      'Content-Type',
      metricsService.contentType,
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('process_cpu_user_seconds_total'),
    );
  });
});
