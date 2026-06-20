import {
  Controller,
  Inject,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { SsoProvidersService } from '@/modules/sso/sso-providers.service';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  AcceptInviteDto,
  LoginDto,
  AuthResponseDto,
  AuthMethodsResponseDto,
  InviteValidationDto,
} from './auth.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { authConfig } from '@/config';
import { ErrorCode } from '@repo/shared/error-codes';
import type { AuthMethodsResponse } from '@repo/shared/auth-methods';
import type { AuthResponse, InviteValidation } from '@repo/shared/schemas';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private authCookie: AuthCookieService,
    private ssoProvidersService: SsoProvidersService,
    private jwt: JwtService,
    @Inject(authConfig.KEY)
    private auth: ConfigType<typeof authConfig>,
  ) {}

  @Public()
  @Get('methods')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(AuthMethodsResponseDto)
  async getAuthMethods(): Promise<AuthMethodsResponse> {
    const ssoProviders = await this.ssoProvidersService.findPublicEnabled();

    return {
      local: { enabled: this.auth.localEnabled },
      sso: ssoProviders,
    };
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 300_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(AuthResponseDto)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    if (!this.auth.localEnabled) {
      throw new ForbiddenException({
        code: ErrorCode.AUTH_LOCAL_DISABLED,
        message: 'Local authentication is disabled',
      });
    }

    const result = await this.authService.login(
      dto,
      req.headers['user-agent'],
      req.ip,
    );

    this.authCookie.setTokens(res, result.accessToken, result.refreshToken);

    return { user: result.user };
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { id, refreshToken: oldToken } = req.user as {
      id: string;
      refreshToken: string;
    };
    const result = await this.authService.refreshTokens(
      id,
      oldToken,
      req.headers['user-agent'],
      req.ip,
    );

    this.authCookie.setTokens(res, result.accessToken, result.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieValue = req.cookies?.refresh_token;
    if (cookieValue) {
      try {
        const payload = this.jwt.verify(cookieValue, {
          secret: this.auth.refreshSecret,
        }) as { jti: string };
        await this.authService.logout(userId, payload.jti);
      } catch {
        // Token invalid/expired — just clear the cookie
      }
    }
    this.authCookie.clearTokens(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(userId);
    this.authCookie.clearTokens(res);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 300_000 } })
  @Post('invite/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiEnvelope(AuthResponseDto, { status: HttpStatus.CREATED })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.acceptInvite(
      dto,
      req.headers['user-agent'],
      req.ip,
    );

    this.authCookie.setTokens(res, result.accessToken, result.refreshToken);

    return { user: result.user };
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Get('invite/validate/:token')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(InviteValidationDto)
  async validateInvite(@Param('token') token: string): Promise<InviteValidation> {
    const result = await this.authService.validateInviteToken(token);
    if (!result.valid) {
      return { valid: false, reason: result.reason };
    }
    return { valid: true, email: result.email, inviterName: result.inviterName };
  }
}
