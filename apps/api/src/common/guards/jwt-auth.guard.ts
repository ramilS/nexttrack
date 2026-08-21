import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { API_KEY_HEADER, IntegrationRequest } from '@/common/http/integration-request';
import { ApiKeyAuthService } from '@/modules/api-keys/api-key-auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private apiKeyAuth: ApiKeyAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<IntegrationRequest>();
    const presented = req.headers[API_KEY_HEADER];
    if (typeof presented === 'string' && presented.length > 0) {
      return this.apiKeyAuth.authenticate(req, presented);
    }

    return (await super.canActivate(context)) as boolean;
  }
}
