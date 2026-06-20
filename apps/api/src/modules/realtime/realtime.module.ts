import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from './presence.service';
import { TypingService } from './typing.service';
import { JwtConfigModule } from '@/common/modules/jwt-config.module';

@Module({
  imports: [JwtConfigModule],
  providers: [RealtimeGateway, PresenceService, TypingService],
  exports: [RealtimeGateway, PresenceService, TypingService],
})
export class RealtimeModule {}
