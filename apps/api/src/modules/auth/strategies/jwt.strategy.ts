import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ErrorCode } from '@repo/shared/error-codes';
import { authConfig } from '@/config';
import type { RequestUser } from '@/common/decorators/current-user.decorator';
import { UsersReader } from '@/modules/users/users.reader';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

function extractFromCookieOrHeader(req: Request): string | null {
  // Prefer httpOnly cookie, fallback to Authorization header
  const fromCookie = req.cookies?.access_token;
  if (fromCookie) return fromCookie;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(authConfig.KEY) config: ConfigType<typeof authConfig>,
    private usersRepo: UsersReader,
  ) {
    super({
      jwtFromRequest: extractFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: config.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Reject soft-deleted users — they keep a valid JWT until expiry, so
    // without this check a removed user can keep using the API for up to
    // accessExpiresIn after deletion.
    const user = await this.usersRepo.findActiveForJwt(payload.sub);

    if (!user) {
      throw new UnauthorizedException(ErrorCode.TOKEN_INVALID);
    }

    if (user.isBlocked) {
      throw new UnauthorizedException(ErrorCode.USER_BLOCKED);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    };
  }
}
