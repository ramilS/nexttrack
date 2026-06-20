import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SearchModule } from '@/modules/search/search.module';

@Module({
  imports: [SearchModule],
  controllers: [HealthController],
})
export class HealthModule {}
