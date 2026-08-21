import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/modules/users/users.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysReader } from './api-keys.reader';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAuthService } from './api-key-auth.service';

/**
 * Global because JwtAuthGuard — used by every module through @ProjectAuth() —
 * injects ApiKeyAuthService. A non-global module would force every consumer to
 * import this one.
 *
 * ApiKeysReader is also exported (repository stays module-private): read-only
 * consumers like ProjectsMembersService (in the equally global ProjectsModule)
 * need `countActiveForUser` to guard hand-removal of a live service
 * principal, without either module importing the other and without exposing
 * the write-capable repository across the boundary.
 */
@Global()
@Module({
  imports: [PrismaModule, UsersModule, ProjectsModule],
  providers: [ApiKeysRepository, ApiKeysReader, ApiKeysService, ApiKeyAuthService],
  exports: [ApiKeyAuthService, ApiKeysService, ApiKeysReader],
})
export class ApiKeysModule {}
