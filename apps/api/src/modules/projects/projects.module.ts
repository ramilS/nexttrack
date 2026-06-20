import { Global, Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsMembersService } from './projects-members.service';
import { ProjectsRepository } from './projects.repository';
import { ProjectMembersRepository } from './project-members.repository';
import { RolesModule } from '@/modules/roles/roles.module';
import { UsersModule } from '@/modules/users/users.module';

@Global()
@Module({
  imports: [RolesModule, UsersModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectsMembersService,
    ProjectsRepository,
    ProjectMembersRepository,
  ],
  exports: [
    ProjectsService,
    ProjectsRepository,
    ProjectMembersRepository,
  ],
})
export class ProjectsModule {}
