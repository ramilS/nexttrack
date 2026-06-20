import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { authConfig } from '@/config';

type ExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.accessSecret,
        signOptions: {
          // authConfig validates this as a string; jsonwebtoken expects the
          // narrower `ms` StringValue template type, so cast to its own type.
          expiresIn: config.accessExpiresIn as ExpiresIn,
        },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class JwtConfigModule {}
