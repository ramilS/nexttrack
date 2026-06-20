import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('internal/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metricsService.contentType);
    res.send(await this.metricsService.getMetrics());
  }
}
