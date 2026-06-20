import { Module } from '@nestjs/common';
import { GanttController } from './gantt.controller';
import { GanttService } from './gantt.service';
import { GanttRepository } from './gantt.repository';
import { WorkflowsModule } from '@/modules/workflows/workflows.module';

@Module({
  imports: [WorkflowsModule],
  controllers: [GanttController],
  providers: [GanttService, GanttRepository],
})
export class GanttModule {}
