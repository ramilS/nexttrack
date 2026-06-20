import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Permission } from '@repo/shared';
import { TagsService } from './tags.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AddIssueTagDto } from './tags.dto';

@Controller('issues/:issueId/tags')
@IssueAuth()
export class IssueTagsController {
  constructor(private tagsService: TagsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.TAG_MANAGE)
  async addTag(
    @Param('issueId') issueId: string,
    @Body() dto: AddIssueTagDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.addTagToIssue(issueId, dto.tagId, userId);
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TAG_MANAGE)
  async removeTag(
    @Param('issueId') issueId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.tagsService.removeTagFromIssue(issueId, tagId, userId);
  }
}
