import { Injectable } from '@nestjs/common';
import {
  BoardsRepository,
  type BoardRef,
  type BoardWithProjectName,
} from './boards.repository';

/**
 * Read-only cross-module surface of the boards aggregate. Modules outside
 * boards/ inject this instead of BoardsRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class BoardsReader {
  constructor(private repo: BoardsRepository) {}

  findRefById(boardId: string): Promise<BoardRef | null> {
    return this.repo.findRefById(boardId);
  }

  findRefWithProjectName(boardId: string): Promise<BoardWithProjectName | null> {
    return this.repo.findRefWithProjectName(boardId);
  }
}
