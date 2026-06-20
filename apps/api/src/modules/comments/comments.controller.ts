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
import { GlobalRole } from '@prisma/client';
import { Permission } from '@repo/shared';
import { CommentsService } from './comments.service';
import { IssueAuth } from '@/common/decorators/issue-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
  CommentDto,
} from './comments.dto';

@Controller('issues/:issueId/comments')
@IssueAuth()
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiCursorPaginated(CommentDto)
  async findAll(
    @Param('issueId') issueId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.findByIssue(issueId, user.id, {
      cursor: query.cursor,
      pageSize: query.pageSize,
      order: query.order,
      isAdmin: user.role === GlobalRole.ADMIN,
    });
  }

  @Post()
  @RequirePermission(Permission.COMMENT_CREATE)
  @ApiEnvelope(CommentDto, { status: HttpStatus.CREATED })
  async create(
    @Param('issueId') issueId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.commentsService.create(issueId, userId, dto);
  }

  @Patch(':commentId')
  @RequirePermission(Permission.COMMENT_EDIT_OWN)
  @ApiEnvelope(CommentDto)
  async update(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.update(
      commentId,
      user.id,
      dto,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.COMMENT_EDIT_OWN)
  async softDelete(
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.commentsService.softDelete(
      commentId,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
  }
}
