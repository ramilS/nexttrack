import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ErrorCode } from '@repo/shared/error-codes';
import { ProjectsRepository } from '@/modules/projects/projects.repository';

@Injectable()
export class ProjectContextInterceptor implements NestInterceptor {
  constructor(private projectsRepo: ProjectsRepository) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();
    const key = req.params.key;

    if (key && !req.project) {
      const project = await this.projectsRepo.findEntityByKey(key);
      if (!project) {
        throw new NotFoundException(ErrorCode.PROJECT_NOT_FOUND);
      }
      req.project = project;
    }

    return next.handle();
  }
}
