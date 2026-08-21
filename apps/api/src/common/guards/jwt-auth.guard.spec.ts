import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyAuthService } from '@/modules/api-keys/api-key-auth.service';
import { createMockExecutionContext } from '@test/helpers';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let apiKeyAuth: { authenticate: jest.Mock };

  beforeEach(() => {
    reflector = new Reflector();
    apiKeyAuth = { authenticate: jest.fn().mockResolvedValue(true) };
    guard = new JwtAuthGuard(reflector, apiKeyAuth as unknown as ApiKeyAuthService);
  });

  it('allows access when @Public() is set, without consulting the api-key or JWT path', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = createMockExecutionContext({ headers: { 'x-api-key': 'nt_abc' } });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(apiKeyAuth.authenticate).not.toHaveBeenCalled();
  });

  it('delegates to the API-key path when the header is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const context = createMockExecutionContext({ headers: { 'x-api-key': 'nt_abc' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(apiKeyAuth.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
      'nt_abc',
    );
  });

  it('ignores an empty header value and falls through to the cookie/JWT path', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockResolvedValue(true);

    const context = createMockExecutionContext({ headers: { 'x-api-key': '' } });
    await guard.canActivate(context);

    expect(apiKeyAuth.authenticate).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it('delegates to passport when no decorator at all and no x-api-key header is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockResolvedValue(true);

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyAuth.authenticate).not.toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
