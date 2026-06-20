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
import { Permission } from '@repo/shared';
import { SprintsService } from './sprints.service';
import { BoardAuth } from '@/common/decorators/board-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiEnvelope,
  ApiPaginated,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  CreateSprintDto,
  UpdateSprintDto,
  StartSprintDto,
  CloseSprintDto,
  SprintIssuesDto,
  SprintsQueryDto,
  BacklogQueryDto,
  BacklogIssuesQueryDto,
  SprintDto,
  CloseSprintResultDto,
  BurndownPointDto,
  BoardIssueCardDto,
  BacklogResponseDto,
  AddSprintIssuesResultDto,
  RemoveSprintIssuesResultDto,
} from './sprints.dto';

@Controller('boards/:boardId/sprints')
@BoardAuth()
export class SprintsController {
  constructor(private sprintsService: SprintsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiPaginated(SprintDto)
  async findAll(
    @Param('boardId') boardId: string,
    @Query() query: SprintsQueryDto,
  ) {
    return this.sprintsService.findAll(boardId, query);
  }

  @Post()
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(SprintDto, { status: HttpStatus.CREATED })
  async create(
    @Param('boardId') boardId: string,
    @Body() dto: CreateSprintDto,
  ) {
    return this.sprintsService.create(boardId, dto);
  }

  @Get('backlog')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(BacklogResponseDto)
  async getBacklog(
    @Param('boardId') boardId: string,
    @Query() query: BacklogQueryDto,
  ) {
    return this.sprintsService.getBacklog(boardId, query);
  }

  @Get('backlog-issues')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiCursorPaginated(BoardIssueCardDto)
  async getBacklogIssues(
    @Param('boardId') boardId: string,
    @Query() query: BacklogIssuesQueryDto,
  ) {
    return this.sprintsService.getBacklogIssues(boardId, query);
  }

  @Get(':sprintId')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(SprintDto)
  async findOne(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.sprintsService.findOne(boardId, sprintId);
  }

  @Patch(':sprintId')
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(SprintDto)
  async update(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: UpdateSprintDto,
  ) {
    return this.sprintsService.update(boardId, sprintId, dto);
  }

  @Post(':sprintId/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(SprintDto)
  async start(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: StartSprintDto,
  ) {
    return this.sprintsService.start(boardId, sprintId, userId, dto);
  }

  @Post(':sprintId/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(CloseSprintResultDto)
  async close(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CloseSprintDto,
  ) {
    return this.sprintsService.close(boardId, sprintId, dto, userId);
  }

  @Delete(':sprintId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.SPRINT_MANAGE)
  async remove(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
  ) {
    await this.sprintsService.remove(boardId, sprintId);
  }

  @Post(':sprintId/issues')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(AddSprintIssuesResultDto)
  async addIssues(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: SprintIssuesDto,
  ) {
    return this.sprintsService.addIssues(boardId, sprintId, dto.issueIds);
  }

  @Delete(':sprintId/issues')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.SPRINT_MANAGE)
  @ApiEnvelope(RemoveSprintIssuesResultDto)
  async removeIssues(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
    @Body() dto: SprintIssuesDto,
  ) {
    return this.sprintsService.removeIssues(boardId, sprintId, dto.issueIds);
  }

  @Get(':sprintId/burndown')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([BurndownPointDto])
  async getBurndown(
    @Param('boardId') boardId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.sprintsService.getBurndown(boardId, sprintId);
  }
}
