import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Project } from '@prisma/client';
import { TimeReportsService } from './time-reports.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  TimeReportExportQueryDto,
  TimeReportQueryDto,
  TimeReportResponseDto,
} from './time-tracking.dto';

@Controller('projects/:key/time-report')
@ProjectAuth()
export class TimeReportsController {
  constructor(private timeReportsService: TimeReportsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(TimeReportResponseDto)
  async getReport(
    @ReqProject() project: Project,
    @Query() query: TimeReportQueryDto,
  ) {
    return this.timeReportsService.getTimeReport(project.id, query);
  }

  @Get('export')
  @RequirePermission(Permission.ISSUE_READ, Permission.TIME_LOG_OWN)
  async exportReport(
    @ReqProject() project: Project,
    @Query() query: TimeReportExportQueryDto,
    @Res() res: Response,
  ) {
    const { format, ...reportQuery } = query;
    const result = await this.timeReportsService.exportReport(project.id, reportQuery, format);

    const ext = format === 'csv' ? 'csv' : 'json';
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="time-report.${ext}"`);
    res.send(result.content);
  }
}
