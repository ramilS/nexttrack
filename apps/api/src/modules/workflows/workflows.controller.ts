import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowDto,
  WorkflowStatusDto,
} from './workflows.dto';

@Controller('projects/:key/workflows')
@ProjectAuth()
export class WorkflowsController {
  constructor(private workflowsService: WorkflowsService) {}

  @Get('statuses')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([WorkflowStatusDto])
  async getDefaultStatuses(@ReqProject() project: Project) {
    return this.workflowsService.getDefaultStatuses(project.id);
  }

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([WorkflowDto])
  async findAll(@ReqProject() project: Project) {
    return this.workflowsService.findAll(project.id);
  }

  @Get(':id')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(WorkflowDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    return this.workflowsService.findOne(project.id, id);
  }

  @Post()
  @RequirePermission(Permission.WORKFLOW_MANAGE)
  @ApiEnvelope(WorkflowDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(project, dto);
  }

  @Put(':id')
  @RequirePermission(Permission.WORKFLOW_MANAGE)
  @ApiEnvelope(WorkflowDto)
  async update(
    @ReqProject() project: Project,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(project.id, id, dto);
  }

  @Patch(':id/default')
  @RequirePermission(Permission.WORKFLOW_MANAGE)
  @ApiEnvelope(WorkflowDto)
  async setDefault(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    return this.workflowsService.setDefault(project.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.WORKFLOW_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    await this.workflowsService.remove(project.id, id);
  }
}
