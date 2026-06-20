import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IssueLinksService } from './issue-links.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateIssueLinkDto,
  IssueLinkDto,
  GroupedIssueLinksDto,
} from './issue-links.dto';

@Controller('issues/:issueId/links')
@IssueAuth()
export class IssueLinksController {
  constructor(private issueLinksService: IssueLinksService) {}

  @Post()
  @RequirePermission(Permission.ISSUE_LINK_MANAGE)
  @ApiEnvelope(IssueLinkDto, { status: HttpStatus.CREATED })
  async create(
    @Param('issueId') issueId: string,
    @Body() dto: CreateIssueLinkDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.issueLinksService.create(issueId, dto, userId);
  }

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([GroupedIssueLinksDto])
  async findAll(@Param('issueId') issueId: string) {
    return this.issueLinksService.findByIssue(issueId);
  }

  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ISSUE_LINK_MANAGE)
  async remove(
    @Param('issueId') issueId: string,
    @Param('linkId') linkId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.issueLinksService.remove(linkId, issueId, userId);
  }
}
