import type { OAuth2Config, OAuth2Token } from '../types';
import { proxyUrl } from './proxyConfig';

/**
 * Exchange an authorization code or client credentials for an access token
 * via the proxy server (avoids CORS issues with token endpoints).
 */
export async function fetchOAuth2Token(
  config: OAuth2Config,
  authorizationCode?: string,
  sslVerification?: boolean,
): Promise<OAuth2Token> {
  const payload: Record<string, string | boolean | undefined> = {
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

  const response = await fetch(proxyUrl('/api/oauth/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (data.error) {
    const detail = data.error_description || data.error;
    throw new Error(`OAuth error: ${detail}`);
  }

  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}`);
  }

  if (!data.access_token) {
    throw new Error('OAuth error: response missing access_token');
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    scope: data.scope,
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
