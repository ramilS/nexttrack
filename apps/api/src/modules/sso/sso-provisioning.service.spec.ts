import { Test } from '@nestjs/testing';
import { GlobalRole, ProvisioningPolicy, SsoProviderType, UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import { buildUser } from '@test/helpers';
import { SsoProvisioningService } from './sso-provisioning.service';
import { SsoRepository, SsoProviderRaw } from './sso.repository';
import { OidcUserInfo } from './providers/base-oidc.provider';
import { TokenIssuerService } from '@/modules/auth/token-issuer.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { InvitesRepository } from '@/modules/users/invites.repository';
import { PermissionDeniedError } from '@/common/errors/domain.errors';

const provider: SsoProviderRaw = {
  id: 'provider-1',
  type: SsoProviderType.GOOGLE,
  clientId: 'cid',
  clientSecret: 'secret',
  isEnabled: true,
  allowedDomain: 'example.com',
  defaultRole: GlobalRole.USER,
  provisioningPolicy: ProvisioningPolicy.AUTO_PROVISION,
};

const userInfo: OidcUserInfo = {
  sub: 'external-sub-1',
  email: 'svc.abc123@integrations.invalid',
  emailVerified: true,
  name: 'MyTracker',
};

describe('SsoProvisioningService.findOrCreateUser — Path B1 (existing account, no connection)', () => {
  let service: SsoProvisioningService;
  let ssoRepo: Record<string, jest.Mock>;
  let usersRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    ssoRepo = {
      findConnectionByExternal: jest.fn().mockResolvedValue(null),
      createConnection: jest.fn().mockResolvedValue(undefined),
    };
    usersRepo = {
      findByEmailWithKind: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        SsoProvisioningService,
        { provide: SsoRepository, useValue: ssoRepo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: InvitesRepository, useValue: {} },
        {
          provide: TokenIssuerService,
          useValue: {
            issueSession: jest
              .fn()
              .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
          },
        },
      ],
    }).compile();

    service = module.get(SsoProvisioningService);
  });

  it('rejects a SERVICE principal matched by email, without linking a connection', async () => {
    usersRepo.findByEmailWithKind.mockResolvedValue(
      buildUser({ kind: UserKind.SERVICE, email: userInfo.email, isBlocked: false }),
    );

    const error: unknown = await service
      .findOrCreateUser(provider, userInfo, undefined, 'ua', '127.0.0.1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).code).toBe(ErrorCode.SSO_USER_BLOCKED);
    expect(ssoRepo.createConnection).not.toHaveBeenCalled();
  });

  it('links a HUMAN account matched by the same email, unaffected by the SERVICE gate', async () => {
    usersRepo.findByEmailWithKind.mockResolvedValue(
      buildUser({
        kind: UserKind.HUMAN,
        email: userInfo.email,
        isBlocked: false,
        avatarUrl: 'https://existing.example/avatar.png',
      }),
    );

    const session = await service.findOrCreateUser(
      provider,
      userInfo,
      undefined,
      'ua',
      '127.0.0.1',
    );

    expect(session.accessToken).toBe('a');
    expect(ssoRepo.createConnection).toHaveBeenCalledTimes(1);
  });
});
