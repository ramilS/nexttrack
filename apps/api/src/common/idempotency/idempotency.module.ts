import { Global, Module } from '@nestjs/common';
import { EventIdempotencyService } from './event-idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';

/**
 * Global so every domain-event listener can inject
 * {@link EventIdempotencyService} without wiring the module explicitly —
 * same rationale as BackgroundTasksModule.
 */
@Global()
@Module({
  providers: [EventIdempotencyService, IdempotencyRepository],
  exports: [EventIdempotencyService, IdempotencyRepository],
})
export class IdempotencyModule {}
