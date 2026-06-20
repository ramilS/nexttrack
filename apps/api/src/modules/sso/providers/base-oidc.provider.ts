export interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

export interface OidcUserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export abstract class BaseOidcProvider {
  abstract getAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    allowedDomain?: string;
  }): string;

  abstract exchangeCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OidcTokenResponse>;

  abstract getUserInfo(
    tokenResponse: OidcTokenResponse,
  ): Promise<OidcUserInfo>;
}
