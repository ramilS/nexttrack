import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { SsoAdminController } from './sso-admin.controller';
import { SsoService } from './sso.service';
import { SsoAccountService } from './sso-account.service';
import { SsoProvidersService } from './sso-providers.service';
import { SsoRepository } from './sso.repository';
import { GoogleProvider } from './providers/google.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { EncryptionService } from '@/common/services/encryption.service';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { JwtConfigModule } from '@/common/modules/jwt-config.module';
import { RefreshTokensRepository } from '@/modules/auth/refresh-tokens.repository';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [JwtConfigModule, UsersModule],
  controllers: [SsoController, SsoAdminController],
  providers: [
    SsoService,
    SsoAccountService,
    SsoProvidersService,
    SsoRepository,
    RefreshTokensRepository,
    GoogleProvider,
    MicrosoftProvider,
    EncryptionService,
    AuthCookieService,
  ],
  exports: [SsoProvidersService],
})
export class SsoModule {}
