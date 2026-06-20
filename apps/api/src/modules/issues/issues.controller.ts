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
  ParseIntPipe,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { IssuesService } from './issues.service';
import { IssuesQueryService } from './issues-query.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { ActivityType } from '@prisma/client';
import {
  ApiEnvelope,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateIssueDto,
  UpdateIssueDto,
  ListIssuesQueryDto,
  BulkUpdateIssuesDto,
  BulkUpdateResultDto,
  IssueActivitiesQueryDto,
  IssueDetailDto,
  IssueListItemDto,
  UserSummaryDto,
  ActivityDto,
} from './issues.dto';

@Controller('projects/:key/issues')
@ProjectAuth()
export class IssuesController {
  constructor(
    private issuesService: IssuesService,
    private issuesQueryService: IssuesQueryService,
    private activitiesService: ActivitiesService,
  ) {}

  @Post()
  @RequirePermission(Permission.ISSUE_CREATE)
  @ApiEnvelope(IssueDetailDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateIssueDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesService.create(project, dto, userId);
  }

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiCursorPaginated(IssueListItemDto)
  async findAll(
    @ReqProject() project: Project,
    @Query() query: ListIssuesQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesQueryService.findAll(project, query, userId);
  }

  @Get(':number')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(IssueDetailDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesQueryService.findByNumber(project, number, userId);
  }

  @Patch('bulk')
  @RequirePermission(Permission.ISSUE_UPDATE)
  @ApiEnvelope(BulkUpdateResultDto)
  async bulkUpdate(
    @ReqProject() project: Project,
    @Body() dto: BulkUpdateIssuesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesService.bulkUpdate(project, dto, userId);
  }

  @Patch(':number')
  @RequirePermission(Permission.ISSUE_UPDATE)
  @ApiEnvelope(IssueDetailDto)
  async update(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @Body() dto: UpdateIssueDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesService.update(project, number, dto, userId);
  }

  @Delete(':number')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_DELETE)
  async softDelete(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('id') userId: string,
  ) {
    await this.issuesService.softDelete(project, number, userId);
  }

  @Post(':number/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_DELETE)
  @ApiEnvelope(IssueDetailDto)
  async restore(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.issuesService.restore(project, number, userId);
  }

  // ─── Sub-issues ────────────────────────────────────────────

  @Get(':number/children')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([IssueListItemDto])
  async getChildren(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
  ) {
    const issue = await this.issuesQueryService.findByNumber(
      project,
      number,
      '',
    );
    return this.issuesQueryService.getChildren(issue.id);
  }

  // ─── Watchers ──────────────────────────────────────────────

  @Post(':number/watchers')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_READ)
  async addWatcher(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('id') userId: string,
  ) {
    const issue = await this.issuesQueryService.findByNumber(
      project,
      number,
      userId,
    );
    await this.issuesService.addWatcher(issue.id, userId);
  }

  @Delete(':number/watchers')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_READ)
  async removeWatcher(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser('id') userId: string,
  ) {
    const issue = await this.issuesQueryService.findByNumber(
      project,
      number,
      userId,
    );
    await this.issuesService.removeWatcher(issue.id, userId);
  }

  @Get(':number/watchers')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([UserSummaryDto])
  async getWatchers(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
  ) {
    const issue = await this.issuesQueryService.findByNumber(
      project,
      number,
      '',
    );
    return this.issuesService.getWatchers(issue.id);
  }

  // ─── Activities ────────────────────────────────────────────

  @Get(':number/activities')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiCursorPaginated(ActivityDto)
  async getActivities(
    @ReqProject() project: Project,
    @Param('number', ParseIntPipe) number: number,
    @Query() query: IssueActivitiesQueryDto,
  ) {
    const issue = await this.issuesQueryService.findByNumber(
      project,
      number,
      '',
    );
    return this.activitiesService.findByIssue(issue.id, {
      cursor: query.cursor,
      pageSize: query.pageSize,
      types: query.types as ActivityType[] | undefined,
    });
  }
}
