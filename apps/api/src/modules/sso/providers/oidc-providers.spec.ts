import { GoogleProvider } from './google.provider';
import { MicrosoftProvider } from './microsoft.provider';

const AUTH_PARAMS = {
  clientId: 'client-1',
  redirectUri: 'http://api/api/auth/sso/callback',
  state: 'state-abc',
  codeChallenge: 'challenge-xyz',
};

const EXCHANGE_PARAMS = {
  code: 'auth-code',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  redirectUri: 'http://api/api/auth/sso/callback',
};

const TOKEN_RESPONSE = {
  access_token: 'at',
  token_type: 'Bearer',
  expires_in: 3600,
};

describe.each([
  ['GoogleProvider', new GoogleProvider()],
  ['MicrosoftProvider', new MicrosoftProvider()],
] as const)('%s PKCE', (_name, provider) => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(TOKEN_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('includes code_challenge and code_challenge_method=S256 in the authorization URL', () => {
    const url = new URL(provider.getAuthorizationUrl(AUTH_PARAMS));

    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  it('sends code_verifier in the token exchange body when provided', async () => {
    await provider.exchangeCode({
      ...EXCHANGE_PARAMS,
      codeVerifier: 'verifier-123',
    });

    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('code_verifier')).toBe('verifier-123');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('omits code_verifier from the token exchange body when absent', async () => {
    await provider.exchangeCode(EXCHANGE_PARAMS);

    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams;
    expect(body.has('code_verifier')).toBe(false);
  });
});
