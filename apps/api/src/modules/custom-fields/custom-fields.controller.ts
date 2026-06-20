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
import { CustomFieldsService } from './custom-fields.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  ReorderCustomFieldsDto,
  AddEnumOptionDto,
  UpdateEnumOptionDto,
  ReorderEnumOptionsDto,
  DeleteEnumOptionQueryDto,
  CustomFieldDto,
} from './custom-fields.dto';

@Controller('projects/:key/custom-fields')
@ProjectAuth()
export class CustomFieldsController {
  constructor(private customFieldsService: CustomFieldsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([CustomFieldDto])
  async findAll(@ReqProject() project: Project) {
    return this.customFieldsService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope(CustomFieldDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.customFieldsService.create(project.id, dto);
  }

  @Get(':fieldId')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(CustomFieldDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
  ) {
    return this.customFieldsService.findOne(fieldId, project.id);
  }

  @Patch(':fieldId')
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope(CustomFieldDto)
  async update(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldsService.update(fieldId, project.id, dto);
  }

  @Put('reorder')
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope([CustomFieldDto])
  async reorder(
    @ReqProject() project: Project,
    @Body() dto: ReorderCustomFieldsDto,
  ) {
    return this.customFieldsService.reorder(project.id, dto);
  }

  @Delete(':fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  async softDelete(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.customFieldsService.softDelete(fieldId, project.id, userId);
  }

  // ─── Enum Options ──────────────────────────────────────────

  @Post(':fieldId/options')
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope(CustomFieldDto, { status: HttpStatus.CREATED })
  async addOption(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @Body() dto: AddEnumOptionDto,
  ) {
    return this.customFieldsService.addEnumOption(fieldId, project.id, dto);
  }

  @Patch(':fieldId/options/:optionId')
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope(CustomFieldDto)
  async updateOption(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateEnumOptionDto,
  ) {
    return this.customFieldsService.updateEnumOption(
      fieldId,
      project.id,
      optionId,
      dto,
    );
  }

  @Delete(':fieldId/options/:optionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  async deleteOption(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Query() query: DeleteEnumOptionQueryDto,
  ) {
    await this.customFieldsService.deleteEnumOption(
      fieldId,
      project.id,
      optionId,
      query.force,
    );
  }

  @Put(':fieldId/options/reorder')
  @RequirePermission(Permission.CUSTOM_FIELD_MANAGE)
  @ApiEnvelope(CustomFieldDto)
  async reorderOptions(
    @ReqProject() project: Project,
    @Param('fieldId') fieldId: string,
    @Body() dto: ReorderEnumOptionsDto,
  ) {
    return this.customFieldsService.reorderEnumOptions(
      fieldId,
      project.id,
      dto,
    );
  }
}
