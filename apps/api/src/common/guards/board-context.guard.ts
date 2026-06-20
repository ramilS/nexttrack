import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@repo/shared/error-codes';
import { BoardsReader } from '@/modules/boards/boards.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';

/**
 * Guard that resolves `req.project` from the `:boardId` route param.
 *
 * Must be registered BEFORE `PermissionGuard` in the guards array
 * so that `req.project` is available when permissions are checked.
 */
@Injectable()
export class BoardContextGuard implements CanActivate {
  constructor(
    private boardsReader: BoardsReader,
    private projectsRepo: ProjectsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const boardId = req.params.boardId;

    if (boardId && !req.project) {
      const board = await this.boardsReader.findRefById(boardId);

      if (!board) {
        throw new NotFoundException(ErrorCode.BOARD_NOT_FOUND);
      }

      const project = await this.projectsRepo.findActiveById(board.projectId);

      if (!project) {
        throw new NotFoundException(ErrorCode.PROJECT_NOT_FOUND);
      }

      req.board = board;
      req.project = project;
    }

    return true;
  }
}
