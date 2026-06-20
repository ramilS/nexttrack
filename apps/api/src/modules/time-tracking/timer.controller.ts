import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { ActiveTimerService } from './active-timer.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser, RequestUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  StartTimerDto,
  StopTimerDto,
  UpdateTimerDto,
  TimeLogDto,
  ActiveTimerDto,
} from './time-tracking.dto';

@Controller('time-tracking/timer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimerController {
  constructor(private activeTimerService: ActiveTimerService) {}

  @Get()
  @ApiEnvelope(ActiveTimerDto, { nullable: true })
  async getActiveTimer(@CurrentUser('id') userId: string) {
    return this.activeTimerService.getActiveTimer(userId);
  }

  @Post('start')
  @ApiEnvelope(ActiveTimerDto, { status: HttpStatus.CREATED })
  async start(
    @CurrentUser() user: RequestUser,
    @Body() dto: StartTimerDto,
  ) {
    return this.activeTimerService.startTimer(
      user.id,
      user.role === GlobalRole.ADMIN,
      dto.issueId,
      dto.description,
    );
  }

  @Post('stop')
  @ApiEnvelope(TimeLogDto, { status: HttpStatus.CREATED })
  async stop(
    @CurrentUser() user: RequestUser,
    @Body() dto: StopTimerDto,
  ) {
    return this.activeTimerService.stopTimer(
      user.id,
      user.role === GlobalRole.ADMIN,
      dto.description,
    );
  }

  @Post('discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discard(@CurrentUser('id') userId: string) {
    await this.activeTimerService.discardTimer(userId);
  }

  @Patch()
  @ApiEnvelope(ActiveTimerDto)
  async updateDescription(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTimerDto,
  ) {
    return this.activeTimerService.updateTimerDescription(userId, dto.description);
  }
}
