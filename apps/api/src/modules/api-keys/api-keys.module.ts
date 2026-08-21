import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/modules/users/users.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAuthService } from './api-key-auth.service';

/**
 * Global because JwtAuthGuard — used by every module through @ProjectAuth() —
 * injects ApiKeyAuthService. A non-global module would force every consumer to
 * import this one.
 *
 * ApiKeysRepository is also exported: ProjectsMembersService (in the equally
 * global ProjectsModule) needs `countActiveForUser` to guard hand-removal of
 * a live service principal, without either module importing the other.
 */
@Global()
@Module({
  imports: [PrismaModule, UsersModule, ProjectsModule],
  providers: [ApiKeysRepository, ApiKeysService, ApiKeyAuthService],
  exports: [ApiKeyAuthService, ApiKeysService, ApiKeysRepository],
})
export class ApiKeysModule {}
