import { Global, Module } from '@nestjs/common';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { BoardsRepository } from '@/modules/boards/boards.repository';
import { BoardsReader } from '@/modules/boards/boards.reader';
import { WorkflowsRepository } from '@/modules/workflows/workflows.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { TagsReader } from '@/modules/tags/tags.reader';
import { CommentsRepository } from '@/modules/comments/comments.repository';
import { SprintsRepository } from '@/modules/sprints/sprints.repository';
import { SprintsReader } from '@/modules/sprints/sprints.reader';
import { UsersRepository } from '@/modules/users/users.repository';
import { UsersReader } from '@/modules/users/users.reader';

/**
 * Hosts repositories that are consumed across module boundaries.
 *
 * Why: feature modules naturally form domain cycles
 *  - Workflows <-> Issues (workflow needs issues for status migration;
 *    issues need workflow for default status)
 *  - Boards <-> Sprints (board services read sprints; sprint service reads boards)
 *  - Guards across all modules need IssuesRepository/BoardsRepository
 * Importing one feature module from another would create DI cycles that
 * need forwardRef — a symptom treatment, not a fix. With repositories
 * global, the cyclic module imports (and every forwardRef) are gone.
 *
 * Repositories themselves are stateless wrappers over PrismaService
 * (already global). Registering them here as @Global providers lets any
 * service inject them without taking on a transitive module dependency.
 * Feature modules continue to declare their own repository providers; the
 * extra instance here is safe because there's no state to drift.
 */
@Global()
@Module({
  providers: [
    IssuesRepository,
    IssuesReader,
    SprintsRepository,
    SprintsReader,
    WorkflowsReader,
    BoardsRepository,
    BoardsReader,
    WorkflowsRepository,
    TagsRepository,
    TagsReader,
    CommentsRepository,
    UsersRepository,
    UsersReader,
  ],
  exports: [
    IssuesRepository,
    IssuesReader,
    SprintsRepository,
    SprintsReader,
    BoardsReader,
    WorkflowsReader,
    TagsRepository,
    TagsReader,
    CommentsRepository,
    UsersRepository,
    UsersReader,
  ],
})
export class SharedRepositoriesModule {}
