import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from './presence.service';
import { TypingService } from './typing.service';
import { JwtConfigModule } from '@/common/modules/jwt-config.module';
import { RealtimeBroadcastListener } from './events/realtime-broadcast.listener';

@Module({
  imports: [JwtConfigModule],
  providers: [
    RealtimeGateway,
    PresenceService,
    TypingService,
    RealtimeBroadcastListener,
  ],
  exports: [RealtimeGateway, PresenceService, TypingService],
})
export class RealtimeModule {}
