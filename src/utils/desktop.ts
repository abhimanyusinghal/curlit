/**
 * Runtime + type bridge for the Electron desktop build.
 *
 * In the desktop app, the preload script exposes `window.curlit` via
 * contextBridge. That means there's no proxy server to run — HTTP, WebSocket,
 * OAuth token exchange, and GitHub device-flow calls all go through IPC into
 * the main (Node) process, which bypasses CORS natively.
 *
 * In the browser build, `window.curlit` is undefined and callers fall back to
 * the existing Express proxy at /api/proxy etc.
 *
 * Every feature module that hits the proxy should check `isDesktop()` first
 * and branch to `desktopApi()` when true.
 */

export interface HttpProxyPayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  bodyType?: string;
  formDataEntries?: Array<{
    key: string; value: string; type: 'text' | 'file';
    fileName?: string; contentType?: string; base64?: string;
  }>;
  binary?: { base64: string; fileName: string; fileType: string };
  sslVerification?: boolean;
}

export interface HttpProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  cookies: Array<{ name: string; value: string }>;
  time: number;
}

export interface OAuthTokenPayload {
  tokenUrl: string;
  grantType: string;
  clientId: string;
  clientSecret?: string;
  code?: string;
  redirectUri?: string;
  scope?: string;
  sslVerification?: boolean;
  clientAuthMethod?: 'basic' | 'post';
}

/** Responses that piggyback an HTTP status alongside JSON payload fields. */
export type StatusResponse<T = Record<string, unknown>> = T & { __status?: number };

export interface WsConnectPayload {
  id: string;
  url: string;
  headers: Record<string, string>;
  sslVerification?: boolean;
}

export type WsEvent =
  | { id: string; type: 'connected' }
  | { id: string; type: 'message'; data: string; isBinary?: boolean; size?: number }
  | { id: string; type: 'closed'; code: number; reason: string }
  | { id: string; type: 'error'; message: string };

export interface CurlitDesktopApi {
  isDesktop: true;
  version(): Promise<{ version: string }>;
  http(payload: HttpProxyPayload): Promise<HttpProxyResponse>;
  oauthToken(payload: OAuthTokenPayload): Promise<StatusResponse>;
  githubStatus(): Promise<{ configured: boolean }>;
  githubDeviceCode(): Promise<StatusResponse>;
  githubDeviceToken(deviceCode: string): Promise<StatusResponse>;
  wsConnect(payload: WsConnectPayload): void;
  wsSend(id: string, data: string): void;
  wsClose(id: string): void;
  onWsEvent(cb: (e: WsEvent) => void): () => void;
}

declare global {
  interface Window {
    curlit?: CurlitDesktopApi;
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.curlit?.isDesktop;
}

export function desktopApi(): CurlitDesktopApi {
  const api = typeof window !== 'undefined' ? window.curlit : undefined;
  if (!api) throw new Error('Desktop API unavailable — not running in Electron');
  return api;
}
