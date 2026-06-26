import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { BoardsService } from './boards.service';
import { BoardDataService } from './board-data.service';
import { BoardIssueMoveService } from './board-issue-move.service';
import { BoardAnalyticsService } from './board-analytics.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateBoardDto,
  UpdateBoardDto,
  UpdateColumnsDto,
  MoveIssueDto,
  BoardQueryDto,
  CfdQueryDto,
  VelocityQueryDto,
  BoardDto,
  BoardDataDto,
  CfdResponseDto,
  VelocityResponseDto,
  BoardMoveResultDto,
} from './boards.dto';

@Controller('projects/:key/boards')
@ProjectAuth()
export class BoardsController {
  constructor(
    private boardsService: BoardsService,
    private boardDataService: BoardDataService,
    private boardIssueMoveService: BoardIssueMoveService,
    private analyticsService: BoardAnalyticsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([BoardDto])
  async findAll(@ReqProject() project: Project) {
    return this.boardsService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.BOARD_MANAGE)
  @ApiEnvelope(BoardDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateBoardDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.boardsService.create(project, dto, userId);
  }

  @Get(':boardId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(BoardDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.findOne(project.id, boardId);
  }

  @Get(':boardId/data')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(BoardDataDto)
  async getBoardData(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Query() query: BoardQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.boardDataService.getBoardData(project.id, boardId, query, userId);
  }

  @Patch(':boardId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.BOARD_MANAGE)
  @ApiEnvelope(BoardDto)
  async update(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(project.id, boardId, dto);
  }

  @Put(':boardId/columns')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.BOARD_MANAGE)
  @ApiEnvelope(BoardDto)
  async updateColumns(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateColumnsDto,
  ) {
    return this.boardsService.updateColumns(project.id, boardId, dto);
  }

  @Patch(':boardId/default')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.BOARD_MANAGE)
  @ApiEnvelope(BoardDto)
  async setDefault(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.setDefault(project.id, boardId);
  }

  @Delete(':boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.BOARD_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
  ) {
    await this.boardsService.remove(project.id, boardId);
  }

  @Get(':boardId/cfd')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(CfdResponseDto)
  async getCfd(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Query() query: CfdQueryDto,
  ) {
    const now = new Date();
    const fromDate = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = query.to ? new Date(query.to) : now;
    return this.analyticsService.getCfd(project.id, boardId, fromDate, toDate, query.interval);
  }

  @Get(':boardId/velocity')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(VelocityResponseDto)
  async getVelocity(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Query() query: VelocityQueryDto,
  ) {
    return this.analyticsService.getVelocity(project.id, boardId, query.limit);
  }

  @Post(':boardId/issues/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.ISSUE_MOVE)
  @ApiEnvelope(BoardMoveResultDto)
  async moveIssue(
    @ReqProject() project: Project,
    @Param('boardId') boardId: string,
    @Body() dto: MoveIssueDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.boardIssueMoveService.moveIssue(project, boardId, dto, userId, userRole);
  }
}
