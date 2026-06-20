import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

@Global()
@Module({
  providers: [RedisService, PermissionsCacheService],
  exports: [RedisService, PermissionsCacheService],
})
export class RedisModule {}
