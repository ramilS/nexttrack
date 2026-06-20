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
import { Project } from '@prisma/client';
import { WorkflowAutomationService } from './workflow-automation.service';
import { WorkflowEngine } from './workflow-engine';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateWorkflowRuleDto,
  UpdateWorkflowRuleDto,
  TestWorkflowRuleDto,
  ExecutionsQueryDto,
  WorkflowRuleDto,
  WorkflowRuleExecutionDto,
  WorkflowRuleDryRunDto,
} from './workflow-automation.dto';

@Controller('projects/:key/workflow-rules')
@ProjectAuth()
export class WorkflowAutomationController {
  constructor(
    private rulesService: WorkflowAutomationService,
    private workflowEngine: WorkflowEngine,
  ) {}

  @Get()
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope([WorkflowRuleDto])
  async findAll(@ReqProject() project: Project) {
    return this.rulesService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope(WorkflowRuleDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateWorkflowRuleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.rulesService.create(project.id, dto, userId);
  }

  @Get(':ruleId')
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope(WorkflowRuleDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
  ) {
    return this.rulesService.findOne(project.id, ruleId);
  }

  @Patch(':ruleId')
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope(WorkflowRuleDto)
  async update(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateWorkflowRuleDto,
  ) {
    return this.rulesService.update(project.id, ruleId, dto);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
  ) {
    await this.rulesService.remove(project.id, ruleId);
  }

  @Post(':ruleId/toggle')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope(WorkflowRuleDto)
  async toggle(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
  ) {
    return this.rulesService.toggle(project.id, ruleId);
  }

  @Get(':ruleId/executions')
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiPaginated(WorkflowRuleExecutionDto)
  async getExecutions(
    @ReqProject() project: Project,
    @Param('ruleId') ruleId: string,
    @Query() query: ExecutionsQueryDto,
  ) {
    return this.rulesService.getExecutions(
      project.id,
      ruleId,
      query.page,
      query.perPage,
    );
  }

  @Post(':ruleId/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.WORKFLOW_RULE_MANAGE)
  @ApiEnvelope(WorkflowRuleDryRunDto)
  async testRule(
    @Param('ruleId') ruleId: string,
    @Body() dto: TestWorkflowRuleDto,
  ) {
    return this.workflowEngine.dryRun(ruleId, {
      issue: {
        type: dto.issue.type,
        priority: dto.issue.priority,
        statusId: dto.issue.statusId,
        statusCategory: dto.issue.statusCategory,
        assigneeId: dto.issue.assigneeId ?? null,
        tagIds: dto.issue.tagIds ?? [],
      },
    });
  }
}
