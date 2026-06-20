import { NotFoundException } from '@nestjs/common';
import { BoardContextGuard } from './board-context.guard';
import { createMockExecutionContext } from '@test/helpers/mock-execution-context';
import { buildProject } from '@test/helpers/factories';
import { ErrorCode } from '@repo/shared/error-codes';
import { BoardsReader } from '@/modules/boards/boards.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';

describe('BoardContextGuard', () => {
  let guard: BoardContextGuard;
  let boardsReader: { findRefById: jest.Mock };
  let projectsRepo: { findActiveById: jest.Mock };

  beforeEach(() => {
    boardsReader = { findRefById: jest.fn() };
    projectsRepo = { findActiveById: jest.fn() };
    guard = new BoardContextGuard(
      boardsReader as unknown as BoardsReader,
      projectsRepo as unknown as ProjectsRepository,
    );
  });

  it('should set req.project and req.board when boardId is present', async () => {
    const project = buildProject();
    const board = { id: 'board-1', projectId: project.id, type: 'SCRUM' };

    boardsReader.findRefById.mockResolvedValue(board);
    projectsRepo.findActiveById.mockResolvedValue(project);

    const ctx = createMockExecutionContext({
      params: { boardId: board.id },
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = ctx
      .switchToHttp()
      .getRequest<{ project: unknown; board: unknown }>();
    expect(req.project).toEqual(project);
    expect(req.board).toEqual(board);
  });

  it('should skip if req.project is already set', async () => {
    const existingProject = buildProject();
    const ctx = createMockExecutionContext({
      params: { boardId: 'some-id' },
      project: existingProject,
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(boardsReader.findRefById).not.toHaveBeenCalled();
  });

  it('should skip if no boardId param', async () => {
    const ctx = createMockExecutionContext({ params: {} });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(boardsReader.findRefById).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when board not found', async () => {
    boardsReader.findRefById.mockResolvedValue(null);

    const ctx = createMockExecutionContext({
      params: { boardId: 'non-existent' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ErrorCode.BOARD_NOT_FOUND);
  });

  it('should throw NotFoundException when project is deleted', async () => {
    boardsReader.findRefById.mockResolvedValue({
      id: 'b1',
      projectId: 'p1',
      type: 'SCRUM',
    });
    projectsRepo.findActiveById.mockResolvedValue(null);

    const ctx = createMockExecutionContext({
      params: { boardId: 'b1' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });
});
