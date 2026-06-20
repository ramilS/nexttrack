import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { MailModule } from '@/modules/mail/mail.module';
import { SsoModule } from '@/modules/sso/sso.module';
import { UsersModule } from '@/modules/users/users.module';
import { JwtConfigModule } from '@/common/modules/jwt-config.module';

@Module({
  imports: [
    PassportModule,
    JwtConfigModule,
    MailModule,
    SsoModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    JwtStrategy,
    JwtRefreshStrategy,
    RefreshTokensRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
