import { Controller, Get, Query } from '@nestjs/common';
import { Project } from '@prisma/client';
import { GanttService } from './gantt.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { GanttQueryDto, GanttDataDto } from './gantt.dto';

@Controller('projects/:key/gantt')
@ProjectAuth()
export class GanttController {
  constructor(private ganttService: GanttService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(GanttDataDto)
  async getGantt(
    @ReqProject() project: Project,
    @Query() dto: GanttQueryDto,
  ) {
    return this.ganttService.getGanttData(project.id, dto);
  }
}
