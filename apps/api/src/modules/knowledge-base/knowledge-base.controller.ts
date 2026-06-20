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
import { KnowledgeBaseService } from './knowledge-base.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateArticleDto,
  UpdateArticleDto,
  MoveArticleDto,
  CreateArticleCommentDto,
  UpdateArticleCommentDto,
  CursorQueryDto,
  ArticleDto,
  ArticleTreeNodeDto,
  ArticleCommentDto,
} from './knowledge-base.dto';

@Controller('projects/:key/articles')
@ProjectAuth()
export class KnowledgeBaseController {
  constructor(private kbService: KnowledgeBaseService) {}

  @Get()
  @RequirePermission(Permission.ARTICLE_READ)
  @ApiCursorPaginated(ArticleDto)
  async findAll(
    @ReqProject() project: Project,
    @Query() query: CursorQueryDto,
  ) {
    return this.kbService.findAll(project.id, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  }

  @Get('tree')
  @RequirePermission(Permission.ARTICLE_READ)
  @ApiEnvelope([ArticleTreeNodeDto])
  async getTree(@ReqProject() project: Project) {
    return this.kbService.getTree(project.id);
  }

  @Post()
  @RequirePermission(Permission.ARTICLE_CREATE)
  @ApiEnvelope(ArticleDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateArticleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.kbService.create(project.id, dto, userId);
  }

  @Get(':slug')
  @RequirePermission(Permission.ARTICLE_READ)
  @ApiEnvelope(ArticleDto)
  async findBySlug(
    @ReqProject() project: Project,
    @Param('slug') slug: string,
  ) {
    return this.kbService.findBySlug(project.id, slug);
  }

  @Patch(':id')
  @RequirePermission(Permission.ARTICLE_UPDATE)
  @ApiEnvelope(ArticleDto)
  async update(
    @ReqProject() project: Project,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.kbService.update(project.id, id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.ARTICLE_DELETE)
  async remove(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    await this.kbService.remove(project.id, id);
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ARTICLE_UPDATE)
  @ApiEnvelope(ArticleDto)
  async move(
    @ReqProject() project: Project,
    @Param('id') id: string,
    @Body() dto: MoveArticleDto,
  ) {
    return this.kbService.move(project.id, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ARTICLE_UPDATE)
  @ApiEnvelope(ArticleDto)
  async publish(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    return this.kbService.publish(project.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ARTICLE_UPDATE)
  @ApiEnvelope(ArticleDto)
  async archive(
    @ReqProject() project: Project,
    @Param('id') id: string,
  ) {
    return this.kbService.archive(project.id, id);
  }

  @Get(':id/comments')
  @RequirePermission(Permission.ARTICLE_READ)
  @ApiCursorPaginated(ArticleCommentDto)
  async findComments(
    @Param('id') id: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.kbService.findComments(id, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  }

  @Post(':id/comments')
  @RequirePermission(Permission.COMMENT_CREATE)
  @ApiEnvelope(ArticleCommentDto, { status: HttpStatus.CREATED })
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateArticleCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.kbService.addComment(id, dto, userId);
  }

  @Patch(':id/comments/:commentId')
  @RequirePermission(Permission.COMMENT_CREATE)
  @ApiEnvelope(ArticleCommentDto)
  async updateComment(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateArticleCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.kbService.updateComment(commentId, dto, userId);
  }

  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.COMMENT_CREATE)
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.kbService.deleteComment(commentId, userId);
  }
}
