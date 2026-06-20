import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Permission } from '@repo/shared';
import { TimeLogsService } from './time-logs.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateTimeLogDto,
  UpdateTimeLogDto,
  TimeLogsQueryDto,
  TimeLogDto,
} from './time-tracking.dto';

@Controller('issues/:issueId/time-logs')
@IssueAuth()
export class TimeLogsController {
  constructor(private timeLogsService: TimeLogsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiCursorPaginated(TimeLogDto)
  async findAll(
    @Param('issueId') issueId: string,
    @Query() query: TimeLogsQueryDto,
  ) {
    return this.timeLogsService.findAll(issueId, query);
  }

  @Post()
  @RequirePermission(Permission.TIME_LOG_OWN)
  @ApiEnvelope(TimeLogDto, { status: HttpStatus.CREATED })
  async create(
    @Param('issueId') issueId: string,
    @Body() dto: CreateTimeLogDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.timeLogsService.create(issueId, userId, dto);
  }

  @Patch(':logId')
  @RequirePermission(Permission.TIME_LOG_OWN)
  @ApiEnvelope(TimeLogDto)
  async update(
    @Param('issueId') issueId: string,
    @Param('logId') logId: string,
    @Body() dto: UpdateTimeLogDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.timeLogsService.update(issueId, logId, userId, dto, userRole);
  }

  @Delete(':logId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TIME_LOG_OWN)
  async remove(
    @Param('issueId') issueId: string,
    @Param('logId') logId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    await this.timeLogsService.softDelete(issueId, logId, userId, userRole);
  }
}
