export interface SsoProviderInfo {
  id: string;
  name: string;
  type: 'GOOGLE' | 'MICROSOFT' | 'OKTA' | 'SAML';
  allowedDomain: string;
}

export interface AuthMethodsResponse {
  local: { enabled: boolean };
  sso: SsoProviderInfo[];
}
