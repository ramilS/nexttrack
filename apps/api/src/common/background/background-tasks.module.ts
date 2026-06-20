import { Global, Module } from '@nestjs/common';
import { BackgroundTasks } from './background-tasks.service';

/**
 * Global so any module can inject {@link BackgroundTasks} without importing it
 * explicitly — mirrors how event listeners and services across the app schedule
 * fire-and-forget work.
 */
@Global()
@Module({
  providers: [BackgroundTasks],
  exports: [BackgroundTasks],
})
export class BackgroundTasksModule {}
