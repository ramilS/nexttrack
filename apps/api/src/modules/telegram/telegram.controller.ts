import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TelegramService } from './telegram.service';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateTelegramConfigDto,
  UpdateTelegramConfigDto,
  TelegramConfigDto,
  TelegramTestResultDto,
} from './telegram.dto';

@Controller('projects/:key/telegram')
@ProjectAuth()
@RequirePermission(Permission.WEBHOOK_MANAGE)
export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(TelegramConfigDto)
  findOne(@ReqProject() project: Project) {
    return this.telegramService.findOne(project.id);
  }

  @Post()
  @ApiEnvelope(TelegramConfigDto, { status: HttpStatus.CREATED })
  create(
    @ReqProject() project: Project,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTelegramConfigDto,
  ) {
    return this.telegramService.create(project.id, userId, dto);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(TelegramConfigDto)
  update(
    @ReqProject() project: Project,
    @Body() dto: UpdateTelegramConfigDto,
  ) {
    return this.telegramService.update(project.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ReqProject() project: Project) {
    return this.telegramService.remove(project.id);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(TelegramTestResultDto)
  test(@ReqProject() project: Project) {
    return this.telegramService.test(project.id);
  }
}
