import { Global, Module } from '@nestjs/common';
import { ValkeyService } from './valkey.service';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

@Global()
@Module({
  providers: [ValkeyService, PermissionsCacheService],
  exports: [ValkeyService, PermissionsCacheService],
})
export class ValkeyModule {}
