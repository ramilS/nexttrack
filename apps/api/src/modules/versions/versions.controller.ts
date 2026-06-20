import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { VersionsService } from './versions.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateVersionDto,
  UpdateVersionDto,
  ReorderVersionsDto,
  ReleaseVersionDto,
  VersionsQueryDto,
  VersionDto,
} from './versions.dto';

@Controller('projects/:key/versions')
@ProjectAuth()
export class VersionsController {
  constructor(private versionsService: VersionsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([VersionDto])
  async findAll(
    @ReqProject() project: Project,
    @Query() query: VersionsQueryDto,
  ) {
    return this.versionsService.findAll(project.id, query.status);
  }

  @Post()
  @RequirePermission(Permission.VERSION_MANAGE)
  @ApiEnvelope(VersionDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateVersionDto,
  ) {
    return this.versionsService.create(project.id, dto);
  }

  @Patch(':versionId')
  @RequirePermission(Permission.VERSION_MANAGE)
  @ApiEnvelope(VersionDto)
  async update(
    @ReqProject() project: Project,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.versionsService.update(versionId, project.id, dto);
  }

  @Put('reorder')
  @RequirePermission(Permission.VERSION_MANAGE)
  @ApiEnvelope([VersionDto])
  async reorder(
    @ReqProject() project: Project,
    @Body() dto: ReorderVersionsDto,
  ) {
    return this.versionsService.reorder(project.id, dto);
  }

  @Patch(':versionId/release')
  @RequirePermission(Permission.VERSION_MANAGE)
  @ApiEnvelope(VersionDto)
  async release(
    @ReqProject() project: Project,
    @Param('versionId') versionId: string,
    @Body() dto: ReleaseVersionDto,
  ) {
    return this.versionsService.release(versionId, project.id, dto.releaseDate);
  }

  @Patch(':versionId/archive')
  @RequirePermission(Permission.VERSION_MANAGE)
  @ApiEnvelope(VersionDto)
  async archive(
    @ReqProject() project: Project,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.archive(versionId, project.id);
  }

  @Delete(':versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.VERSION_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('versionId') versionId: string,
  ) {
    await this.versionsService.remove(versionId, project.id);
  }
}
