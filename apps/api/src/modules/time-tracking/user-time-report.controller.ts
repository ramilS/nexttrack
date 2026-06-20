import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TimeReportsService } from './time-reports.service';
import {
  UserTimeReportQueryDto,
  UserTimeReportResponseDto,
} from './time-tracking.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';

@Controller('users/me/time-report')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserTimeReportController {
  constructor(private timeReportsService: TimeReportsService) {}

  @Get()
  @ApiEnvelope(UserTimeReportResponseDto)
  async getMyReport(
    @CurrentUser('id') userId: string,
    @Query() query: UserTimeReportQueryDto,
  ) {
    return this.timeReportsService.getUserTimeReport(userId, query);
  }
}
