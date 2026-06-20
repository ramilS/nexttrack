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
import { TagsService } from './tags.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { CreateTagDto, UpdateTagDto, TagDto } from './tags.dto';

@Controller('projects/:key/tags')
@ProjectAuth()
export class TagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([TagDto])
  async findAll(@ReqProject() project: Project) {
    return this.tagsService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.TAG_MANAGE)
  @ApiEnvelope(TagDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(project.id, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.TAG_MANAGE)
  @ApiEnvelope(TagDto)
  async update(
    @ReqProject() project: Project,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(project.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TAG_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    await this.tagsService.remove(project.id, id);
  }
}
