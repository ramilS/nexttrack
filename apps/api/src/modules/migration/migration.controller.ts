import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipTimeout } from '@/common/interceptors/skip-timeout.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { MigrationGuard } from './migration.guard';
import { MigrationService } from './migration.service';
import { MigrationManifestService } from './migration-manifest.service';
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
  MigrationActivitiesDto,
  MigrationActivitiesResultDto,
  MigrationCreateBoardDto,
  MigrationCreateSprintDto,
  MigrationSprintIssuesDto,
  MigrationEntityIdResultDto,
  MigrationSprintIssuesResultDto,
  MigrationCreateProjectDto,
  MigrationProjectResultDto,
  MigrationCreateCustomFieldDto,
  MigrationCustomFieldResultDto,
  MigrationAttachmentMetaDto,
  SetAttachmentMetadataDto,
  MigrationStatusesDto,
  AddMembersDto,
  MigrationMembersResultDto,
  StartMigrationRunDto,
  DiscoverMigrationEntitiesDto,
  TransitionMigrationEntityDto,
  ListMigrationEntitiesQueryDto,
  MigrationRunResultDto,
  MigrationRunSummaryDto,
  MigrationEntitiesResultDto,
  MigrationEntityResultDto,
} from './migration.dto';
import type { MigrationEntity, MigrationRun } from '@prisma/client';
import type { MigrationRunSummary } from './migration-manifest.repository';

// Bulk admin import behind MigrationGuard (admin JWT + secret) — the global
// per-IP throttle only breaks high-throughput migration; it is not a public route.
// The throttlers are NAMED (short/medium/long), so @SkipThrottle() with no args
// (which only skips a bucket literally named "default") is a no-op here — each
// named bucket must be opted out explicitly.
@SkipThrottle({ short: true, medium: true, long: true })
@Controller('admin/migration')
@UseGuards(JwtAuthGuard, MigrationGuard)
export class MigrationController {
  constructor(
    private readonly migrationService: MigrationService,
    private readonly migrationManifestService: MigrationManifestService,
  ) {}

  @Post('runs')
  @ApiEnvelope(MigrationRunResultDto, { status: HttpStatus.CREATED })
  async startRun(@Body() dto: StartMigrationRunDto) {
    const run = await this.migrationManifestService.startRun(dto);
    return { data: this.serializeRun(run) };
  }

  @Get('runs/:runId')
  @ApiEnvelope(MigrationRunSummaryDto)
  async getRun(@Param('runId') runId: string) {
    const summary = await this.migrationManifestService.getRun(runId);
    return this.serializeSummary(summary);
  }

  @Post('runs/:runId/entities/discover')
  @ApiEnvelope(MigrationEntitiesResultDto, { status: HttpStatus.CREATED })
  async discoverEntities(
    @Param('runId') runId: string,
    @Body() dto: DiscoverMigrationEntitiesDto,
  ) {
    const entities = await this.migrationManifestService.discover(
      runId,
      dto.entities,
    );
    return { data: entities.map((entity) => this.serializeEntity(entity)) };
  }

  @Patch('runs/:runId/entities/state')
  @ApiEnvelope(MigrationEntityResultDto)
  async transitionEntity(
    @Param('runId') runId: string,
    @Body() dto: TransitionMigrationEntityDto,
  ) {
    const entity = await this.migrationManifestService.transition(runId, dto);
    return { data: this.serializeEntity(entity) };
  }

  @Get('runs/:runId/entities')
  @ApiEnvelope(MigrationEntitiesResultDto)
  async listEntities(
    @Param('runId') runId: string,
    @Query() query: ListMigrationEntitiesQueryDto,
  ) {
    const entities = await this.migrationManifestService.listEntities(
      runId,
      query,
    );
    return { data: entities.map((entity) => this.serializeEntity(entity)) };
  }

  @Post('runs/:runId/complete')
  @ApiEnvelope(MigrationRunSummaryDto, { status: HttpStatus.CREATED })
  async completeRun(@Param('runId') runId: string) {
    const summary = await this.migrationManifestService.complete(runId);
    return this.serializeSummary(summary);
  }

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

  @Post('projects/:projectKey/custom-fields')
  @ApiEnvelope(MigrationCustomFieldResultDto, { status: HttpStatus.CREATED })
  createCustomField(
    @Param('projectKey') projectKey: string,
    @Body() dto: MigrationCreateCustomFieldDto,
  ) {
    return this.migrationService.createCustomField(projectKey, dto);
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

  @Post('issues/:issueId/activities')
  @ApiEnvelope(MigrationActivitiesResultDto, { status: HttpStatus.CREATED })
  createActivities(
    @Param('issueId') issueId: string,
    @Body() dto: MigrationActivitiesDto,
  ) {
    return this.migrationService.createActivities(issueId, dto.entries);
  }

  @Patch('attachments/:attachmentId/metadata')
  @ApiEnvelope(MigrationSuccessDto)
  setAttachmentMetadata(
    @Param('attachmentId') attachmentId: string,
    @Body() dto: SetAttachmentMetadataDto,
  ) {
    return this.migrationService.setAttachmentMetadata(attachmentId, dto);
  }

  // Raw-stream attachment upload — file bytes are the request body, metadata is
  // in the query string. No size cap / MIME check (trusted bulk import), and
  // exempt from the request timeout so large files aren't aborted.
  @Post('issues/:issueId/attachments')
  @SkipTimeout()
  @ApiEnvelope(MigrationEntityIdResultDto, { status: HttpStatus.CREATED })
  uploadAttachment(
    @Param('issueId') issueId: string,
    @Query() meta: MigrationAttachmentMetaDto,
    @Req() req: Request,
  ) {
    return this.migrationService.uploadAttachment(issueId, req, meta);
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

  private serializeRun(run: MigrationRun) {
    return {
      id: run.id,
      sourceSystem: run.sourceSystem,
      sourceTenant: run.sourceTenant,
      sourceUrl: run.sourceUrl,
      targetUrl: run.targetUrl,
      configHash: run.configHash,
      specVersion: run.specVersion,
      exclusionVersion: run.exclusionVersion,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private serializeSummary(summary: MigrationRunSummary) {
    return { data: this.serializeRun(summary.run), counts: summary.counts };
  }

  private serializeEntity(entity: MigrationEntity) {
    return {
      id: entity.id,
      runId: entity.runId,
      entityType: entity.entityType,
      sourceId: entity.sourceId,
      sourceChecksum: entity.sourceChecksum,
      targetId: entity.targetId,
      status: entity.status,
      attemptCount: entity.attemptCount,
      errorCode: entity.errorCode,
      errorMessage: entity.errorMessage,
      discoveredAt: entity.discoveredAt.toISOString(),
      transformedAt: entity.transformedAt?.toISOString() ?? null,
      loadedAt: entity.loadedAt?.toISOString() ?? null,
      verifiedAt: entity.verifiedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
