import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SearchModule } from '@/modules/search/search.module';

@Module({
  imports: [SearchModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
