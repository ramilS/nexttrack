import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { AutoAssignService } from './auto-assign.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateAutoAssignRuleDto,
  PreviewAutoAssignDto,
  UpdateAutoAssignRuleDto,
  AutoAssignRuleDto,
  AutoAssignPreviewDto,
} from './auto-assign.dto';

@Controller('projects/:key/auto-assign')
@ProjectAuth()
export class AutoAssignController {
  constructor(private autoAssignService: AutoAssignService) {}

  @Get()
  @RequirePermission(Permission.AUTO_ASSIGN_MANAGE)
  @ApiEnvelope([AutoAssignRuleDto])
  async findAll(@ReqProject() project: Project) {
    return this.autoAssignService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.AUTO_ASSIGN_MANAGE)
  @ApiEnvelope(AutoAssignRuleDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateAutoAssignRuleDto,
  ) {
    return this.autoAssignService.create(project.id, dto);
  }

  @Patch(':ruleId')
  @RequirePermission(Permission.AUTO_ASSIGN_MANAGE)
  @ApiEnvelope(AutoAssignRuleDto)
  async update(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAutoAssignRuleDto,
  ) {
    return this.autoAssignService.update(project.id, ruleId, dto);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.AUTO_ASSIGN_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
  ) {
    await this.autoAssignService.remove(project.id, ruleId);
  }

  @Post('preview')
  @RequirePermission(Permission.AUTO_ASSIGN_MANAGE)
  @ApiEnvelope(AutoAssignPreviewDto, { status: HttpStatus.CREATED })
  async preview(
    @ReqProject() project: Project,
    @Body() dto: PreviewAutoAssignDto,
  ) {
    return this.autoAssignService.preview(project.id, dto);
  }
}
