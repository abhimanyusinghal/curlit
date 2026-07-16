import type { OAuth2Config, OAuth2Token } from '../types';
import { proxyUrl } from './proxyConfig';
import { isDesktop, desktopApi, type OAuthTokenPayload } from './desktop';

/**
 * Exchange an authorization code or client credentials for an access token.
 *
 * Browser build: routes through the Express proxy (/api/oauth/token) to avoid
 * CORS restrictions at the token endpoint.
 * Desktop build: calls the Electron main process directly via IPC — no proxy
 * server involved.
 */
export async function fetchOAuth2Token(
  config: OAuth2Config,
  authorizationCode?: string,
  sslVerification?: boolean,
): Promise<OAuth2Token> {
  const payload: OAuthTokenPayload = {
    tokenUrl: config.tokenUrl,
    grantType: config.grantType,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scope: config.scope,
    sslVerification: sslVerification !== false,
    clientAuthMethod: config.clientAuthMethod || 'post',
  };

  if (config.grantType === 'authorization_code') {
    payload.code = authorizationCode;
    if (config.callbackUrl) {
      payload.redirectUri = config.callbackUrl;
    }
  }

  let data: Record<string, unknown>;
  let status: number;
  if (isDesktop()) {
    const result = await desktopApi().oauthToken(payload);
    status = (result.__status as number) ?? 200;
    data = result;
  } else {
    const response = await fetch(proxyUrl('/api/oauth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    data = await response.json();
    status = response.status;
  }

  if (data.error) {
    const detail = (data.error_description as string) || (data.error as string);
    throw new Error(`OAuth error: ${detail}`);
  }

  if (status < 200 || status >= 300) {
    throw new Error(`Token request failed with status ${status}`);
  }

  if (!data.access_token) {
    throw new Error('OAuth error: response missing access_token');
  }

  return {
    accessToken: data.access_token as string,
    tokenType: (data.token_type as string) || 'Bearer',
    expiresIn: data.expires_in as number | undefined,
    refreshToken: data.refresh_token as string | undefined,
    scope: data.scope as string | undefined,
    obtainedAt: Date.now(),
  };
}

/**
 * Build the authorization URL for the authorization code flow.
 * The user opens this URL in a browser to grant access.
 */
export function buildAuthorizationUrl(config: OAuth2Config): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
  });

  if (config.callbackUrl) {
    params.set('redirect_uri', config.callbackUrl);
  }

  if (config.scope) {
    params.set('scope', config.scope);
  }

  if (config.state) {
    params.set('state', config.state);
  }

  const separator = config.authUrl.includes('?') ? '&' : '?';
  return `${config.authUrl}${separator}${params.toString()}`;
}

/**
 * Check whether a stored token has expired (with a 30-second buffer).
 */
export function isTokenExpired(token: OAuth2Token): boolean {
  if (!token.expiresIn || !token.obtainedAt) return false;
  const expiresAt = token.obtainedAt + token.expiresIn * 1000;
  return Date.now() > expiresAt - 30_000;
}
