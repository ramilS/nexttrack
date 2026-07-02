import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { MigrationGuard } from './migration.guard';
import { MigrationService } from './migration.service';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateUserMigrationReqDto,
  CreateIssueMigrationReqDto,
  SetDatesReqDto,
  CreateCommentMigrationReqDto,
  FindUserByEmailQueryDto,
  SetIssueParentDto,
  MigrationUserResultDto,
  MigrationUserLookupDto,
  MigrationIssueResultDto,
  MigrationIssueLookupDto,
  MigrationCommentResultDto,
  MigrationSuccessDto,
  MigrationStatsDto,
  MigrationCustomFieldsDto,
  MigrationCreateTagDto,
  LinkIssueTagsDto,
  MigrationTagResultDto,
  MigrationTagLinkResultDto,
  MigrationCreateLinkDto,
  MigrationLinkResultDto,
  MigrationTimeLogsDto,
  MigrationTimeLogsResultDto,
  MigrationCreateBoardDto,
  MigrationCreateSprintDto,
  MigrationSprintIssuesDto,
  MigrationEntityIdResultDto,
  MigrationSprintIssuesResultDto,
  MigrationCreateProjectDto,
  MigrationProjectResultDto,
  SetAttachmentMetadataDto,
  MigrationStatusesDto,
  AddMembersDto,
  MigrationMembersResultDto,
} from './migration.dto';

// Bulk admin import behind MigrationGuard (admin JWT + secret) — the global
// per-IP throttle only breaks high-throughput migration; it is not a public route.
@SkipThrottle()
@Controller('admin/migration')
@UseGuards(JwtAuthGuard, MigrationGuard)
export class MigrationController {
  constructor(private migrationService: MigrationService) {}

  @Post('users')
  @ApiEnvelope(MigrationUserResultDto, { status: HttpStatus.CREATED })
  createUser(@Body() dto: CreateUserMigrationReqDto) {
    return this.migrationService.createUser(dto);
  }

  @Get('users/by-email')
  @ApiEnvelope(MigrationUserLookupDto)
  findUserByEmail(@Query() query: FindUserByEmailQueryDto) {
    return this.migrationService.findUserByEmail(query.email);
  }

  @Post('issues/:projectKey')
  @ApiEnvelope(MigrationIssueResultDto, { status: HttpStatus.CREATED })
  createIssue(
    @Param('projectKey') projectKey: string,
    @Body() dto: CreateIssueMigrationReqDto,
  ) {
    return this.migrationService.createIssue(projectKey, dto);
  }

  @Get('issues/by-yt-id/:ytId')
  @ApiEnvelope(MigrationIssueLookupDto)
  findByYtId(@Param('ytId') ytId: string) {
    return this.migrationService.findByYtId(ytId);
  }

  @Patch('issues/:issueId/dates')
  @ApiEnvelope(MigrationSuccessDto)
  setDates(@Param('issueId') issueId: string, @Body() dto: SetDatesReqDto) {
    return this.migrationService.setOriginalDates(issueId, dto);
  }

  @Patch('issues/:issueId/parent')
  @ApiEnvelope(MigrationSuccessDto)
  setParent(
    @Param('issueId') issueId: string,
    @Body() dto: SetIssueParentDto,
  ) {
    return this.migrationService.setIssueParent(issueId, dto.parentId);
  }

  @Post('issues/:issueId/comments')
  @ApiEnvelope(MigrationCommentResultDto, { status: HttpStatus.CREATED })
  createComment(
    @Param('issueId') issueId: string,
    @Body() dto: CreateCommentMigrationReqDto,
  ) {
    return this.migrationService.createComment(
      issueId,
      dto.authorId,
      dto.body,
      dto.originalCreatedAt,
    );
  }

  @Get('stats/:projectKey')
  @ApiEnvelope(MigrationStatsDto)
  getStats(@Param('projectKey') projectKey: string) {
    return this.migrationService.getProjectStats(projectKey);
  }

  @Get('custom-fields/:projectKey')
  @ApiEnvelope(MigrationCustomFieldsDto)
  getCustomFields(@Param('projectKey') projectKey: string) {
    return this.migrationService.getCustomFieldMap(projectKey);
  }

  @Get('statuses/:projectKey')
  @ApiEnvelope(MigrationStatusesDto)
  getStatuses(@Param('projectKey') projectKey: string) {
    return this.migrationService.getStatusMap(projectKey);
  }

  @Post('projects/:projectKey/members')
  @ApiEnvelope(MigrationMembersResultDto, { status: HttpStatus.CREATED })
  addMembers(
    @Param('projectKey') projectKey: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.migrationService.addProjectMembers(projectKey, dto.members);
  }

  @Post('projects/:projectKey/tags')
  @ApiEnvelope(MigrationTagResultDto, { status: HttpStatus.CREATED })
  createTag(
    @Param('projectKey') projectKey: string,
    @Body() dto: MigrationCreateTagDto,
  ) {
    return this.migrationService.createTag(projectKey, dto);
  }

  @Post('issues/:issueId/tags')
  @ApiEnvelope(MigrationTagLinkResultDto, { status: HttpStatus.CREATED })
  linkTags(
    @Param('issueId') issueId: string,
    @Body() dto: LinkIssueTagsDto,
  ) {
    return this.migrationService.linkIssueTags(issueId, dto.tagIds);
  }

  @Post('issues/:issueId/links')
  @ApiEnvelope(MigrationLinkResultDto, { status: HttpStatus.CREATED })
  createLink(
    @Param('issueId') issueId: string,
    @Body() dto: MigrationCreateLinkDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.migrationService.createIssueLink(issueId, dto, userId);
  }

  @Post('issues/:issueId/time-logs')
  @ApiEnvelope(MigrationTimeLogsResultDto, { status: HttpStatus.CREATED })
  createTimeLogs(
    @Param('issueId') issueId: string,
    @Body() dto: MigrationTimeLogsDto,
  ) {
    return this.migrationService.createTimeLogs(issueId, dto.entries);
  }

  @Patch('attachments/:attachmentId/metadata')
  @ApiEnvelope(MigrationSuccessDto)
  setAttachmentMetadata(
    @Param('attachmentId') attachmentId: string,
    @Body() dto: SetAttachmentMetadataDto,
  ) {
    return this.migrationService.setAttachmentMetadata(attachmentId, dto);
  }

  @Post('projects')
  @ApiEnvelope(MigrationProjectResultDto, { status: HttpStatus.CREATED })
  createProject(
    @Body() dto: MigrationCreateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.migrationService.createProject(dto, userId);
  }

  @Post('projects/:projectKey/boards')
  @ApiEnvelope(MigrationEntityIdResultDto, { status: HttpStatus.CREATED })
  createBoard(
    @Param('projectKey') projectKey: string,
    @Body() dto: MigrationCreateBoardDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.migrationService.createBoard(projectKey, dto, userId);
  }

  @Post('boards/:boardId/sprints')
  @ApiEnvelope(MigrationEntityIdResultDto, { status: HttpStatus.CREATED })
  createSprint(
    @Param('boardId') boardId: string,
    @Body() dto: MigrationCreateSprintDto,
  ) {
    return this.migrationService.createSprint(boardId, dto);
  }

  @Post('boards/:boardId/sprints/:sprintId/issues')
  @ApiEnvelope(MigrationSprintIssuesResultDto, { status: HttpStatus.CREATED })
  addSprintIssues(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: MigrationSprintIssuesDto,
  ) {
    return this.migrationService.addSprintIssues(boardId, sprintId, dto.issueIds);
  }
}
