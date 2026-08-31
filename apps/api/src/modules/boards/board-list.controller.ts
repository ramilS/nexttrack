import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardSummaryDto } from './boards.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';

/**
 * Cross-project board listing, backing the board switcher.
 *
 * Deliberately NOT part of `BoardsController`: that one is `@ProjectAuth()`,
 * which resolves exactly one `req.project` from `:key` and checks permissions
 * against it. This route spans every project the caller belongs to, so it has
 * no single project to authorize against and is gated by membership instead
 * (see `ProjectAccessService`). It returns identities only — opening a board
 * still goes through the project-scoped, permission-checked routes.
 */
@Controller('boards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BoardListController {
  constructor(private boardsService: BoardsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope([BoardSummaryDto])
  async findAllVisible(@CurrentUser('id') userId: string) {
    return this.boardsService.findAllVisible(userId);
  }
}
