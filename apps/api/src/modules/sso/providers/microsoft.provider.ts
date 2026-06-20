import { Injectable } from '@nestjs/common';
import {
  BaseOidcProvider,
  OidcTokenResponse,
  OidcUserInfo,
} from './base-oidc.provider';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';

@Injectable()
export class MicrosoftProvider extends BaseOidcProvider {
  getAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    allowedDomain?: string;
  }): string {
    const query = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      response_type: 'code',
      scope: 'openid email profile User.Read',
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });

    return `${MS_AUTH_URL}?${query.toString()}`;
  }

  async exchangeCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });

    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const response = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Microsoft token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  async getUserInfo(tokenResponse: OidcTokenResponse): Promise<OidcUserInfo> {
    const response = await fetch(MS_GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph me failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      sub: data.id,
      email: data.mail || data.userPrincipalName,
      // Graph /me has no email_verified claim; mail/UPN are asserted by the Azure AD tenant
      emailVerified: true,
      name: data.displayName,
      picture: undefined,
    };
  }
}
