import {
  Controller,
  Get,
  Inject,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Request, Response } from 'express';
import { SsoService } from './sso.service';
import { SsoAccountService } from './sso-account.service';
import { SsoProvidersService } from './sso-providers.service';
import { AuthCookieService } from '@/common/services/auth-cookie.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  SsoFinalizeDto,
  SsoConnectDto,
  SsoAuthorizeQueryDto,
  SsoCallbackQueryDto,
  PublicSsoProviderDto,
  UserSsoConnectionDto,
  SsoFinalizeResponseDto,
  SsoConnectResponseDto,
} from './sso.dto';
import { appConfig } from '@/config';

@Controller('auth/sso')
export class SsoController {
  constructor(
    private ssoService: SsoService,
    private ssoAccountService: SsoAccountService,
    private ssoProvidersService: SsoProvidersService,
    private authCookie: AuthCookieService,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
  ) {}

  @Public()
  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope([PublicSsoProviderDto])
  getPublicProviders() {
    return this.ssoProvidersService.findPublicEnabled();
  }

  @Public()
  @Get(':providerId/authorize')
  async authorize(
    @Param('providerId') providerId: string,
    @Query() query: SsoAuthorizeQueryDto,
    @Res() res: Response,
  ) {
    const safeRedirectTo = this.validateRedirectUrl(query.redirectTo);
    const url = await this.ssoService.generateAuthUrl(
      providerId,
      safeRedirectTo,
      query.inviteToken,
    );
    res.redirect(url);
  }

  private validateRedirectUrl(redirectTo?: string): string | undefined {
    if (!redirectTo) return undefined;

    if (redirectTo.startsWith('/')) return redirectTo;

    try {
      const target = new URL(redirectTo);
      const allowed = new URL(this.app.webUrl);
      if (target.origin === allowed.origin) return redirectTo;
    } catch {
      // Malformed redirectTo URL — reject it by falling through to undefined.
    }

    return undefined;
  }

  @Public()
  @Get('callback')
  async callback(
    @Query() query: SsoCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (query.error) {
      return res.redirect(`${this.app.webUrl}/login?sso_error=${query.error}`);
    }

    const result = await this.ssoService.handleCallback(
      query.code,
      query.state,
      req.headers['user-agent'],
      req.ip,
    );

    return res.redirect(result.redirectUrl);
  }

  @Public()
  @Post('finalize')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(SsoFinalizeResponseDto)
  async finalize(
    @Body() dto: SsoFinalizeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.ssoService.finalize(
      dto.code,
    );

    this.authCookie.setTokens(res, accessToken, refreshToken);

    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':providerId/connect')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope(SsoConnectResponseDto)
  async connect(
    @Param('providerId') providerId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SsoConnectDto,
  ) {
    return this.ssoAccountService.connectToExistingAccount(userId, providerId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':providerId/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @Param('providerId') providerId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.ssoAccountService.disconnect(userId, providerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connections')
  @HttpCode(HttpStatus.OK)
  @ApiEnvelope([UserSsoConnectionDto])
  getMyConnections(@CurrentUser('id') userId: string) {
    return this.ssoAccountService.getUserConnections(userId);
  }
}
