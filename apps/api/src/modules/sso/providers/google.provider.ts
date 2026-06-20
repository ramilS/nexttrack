import { Injectable } from '@nestjs/common';
import {
  BaseOidcProvider,
  OidcTokenResponse,
  OidcUserInfo,
} from './base-oidc.provider';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

@Injectable()
export class GoogleProvider extends BaseOidcProvider {
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
      scope: 'openid email profile',
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'select_account',
    });

    if (params.allowedDomain) {
      query.set('hd', params.allowedDomain);
    }

    return `${GOOGLE_AUTH_URL}?${query.toString()}`;
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

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Google token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  async getUserInfo(tokenResponse: OidcTokenResponse): Promise<OidcUserInfo> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
    });

    if (!response.ok) {
      throw new Error(`Google userinfo failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      sub: data.sub,
      email: data.email,
      emailVerified: data.email_verified === true,
      name: data.name,
      picture: data.picture,
    };
  }
}
