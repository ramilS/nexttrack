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
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
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
  MigrationStatusesDto,
  AddMembersDto,
  MigrationMembersResultDto,
} from './migration.dto';

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
}
