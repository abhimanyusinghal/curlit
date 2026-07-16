import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRequest, createFormDataEntry, createKeyValuePair } from '../../types';
import type { CurlitDesktopApi, HttpProxyResponse, WsEvent } from '../desktop';
import { desktopApi, isDesktop } from '../desktop';
import { fetchSyncStatus, pollDeviceToken, requestDeviceCode } from '../github';
import { sendRequest } from '../http';
import { fetchOAuth2Token } from '../oauth';

interface DesktopTestBridge {
  api: CurlitDesktopApi;
  http: ReturnType<typeof vi.fn>;
  oauthToken: ReturnType<typeof vi.fn>;
  githubStatus: ReturnType<typeof vi.fn>;
  githubDeviceCode: ReturnType<typeof vi.fn>;
  githubDeviceToken: ReturnType<typeof vi.fn>;
  wsConnect: ReturnType<typeof vi.fn>;
  wsSend: ReturnType<typeof vi.fn>;
  wsClose: ReturnType<typeof vi.fn>;
  onWsEvent: ReturnType<typeof vi.fn>;
  emitWsEvent: (event: WsEvent) => void;
}

function installDesktopBridge(): DesktopTestBridge {
  let wsListener: ((event: WsEvent) => void) | undefined;
  const http = vi.fn();
  const oauthToken = vi.fn();
  const githubStatus = vi.fn();
  const githubDeviceCode = vi.fn();
  const githubDeviceToken = vi.fn();
  const wsConnect = vi.fn();
  const wsSend = vi.fn();
  const wsClose = vi.fn();
  const onWsEvent = vi.fn((callback: (event: WsEvent) => void) => {
    wsListener = callback;
    return () => {
      if (wsListener === callback) wsListener = undefined;
    };
  });

  const api: CurlitDesktopApi = {
    isDesktop: true,
    version: async () => ({ version: 'test' }),
    http,
    oauthToken,
    githubStatus,
    githubDeviceCode,
    githubDeviceToken,
    wsConnect,
    wsSend,
    wsClose,
    onWsEvent,
  };

  window.curlit = api;
  return {
    api,
    http,
    oauthToken,
    githubStatus,
    githubDeviceCode,
    githubDeviceToken,
    wsConnect,
    wsSend,
    wsClose,
    onWsEvent,
    emitWsEvent: event => wsListener?.(event),
  };
}

function httpResponse(overrides: Partial<HttpProxyResponse> = {}): HttpProxyResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    cookies: [],
    time: 1,
    ...overrides,
  };
}

describe('Electron renderer bridge', () => {
  let bridge: DesktopTestBridge;

  beforeEach(() => {
    delete window.curlit;
    bridge = installDesktopBridge();
  });

  afterEach(() => {
    delete window.curlit;
    vi.restoreAllMocks();
  });

  it('detects the preload bridge and fails clearly when it is unavailable', () => {
    expect(isDesktop()).toBe(true);
    expect(desktopApi()).toBe(bridge.api);

    delete window.curlit;
    expect(isDesktop()).toBe(false);
    expect(() => desktopApi()).toThrow('Desktop API unavailable');
  });

  it('sends HTTP requests through IPC instead of the browser proxy', async () => {
    bridge.http.mockResolvedValueOnce(httpResponse({
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json' },
      body: '{"created":true}',
      cookies: [{ name: 'session', value: 'abc' }],
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const request = createDefaultRequest({
      id: 'desktop-http',
      method: 'POST',
      url: 'https://api.example.test/widgets',
      params: [createKeyValuePair({ key: 'draft', value: 'true' })],
      headers: [createKeyValuePair({ key: 'Accept', value: 'application/json' })],
      body: { type: 'json', raw: '{"name":"CurlIt"}', formData: [], urlencoded: [] },
      sslVerification: false,
    });

    const result = await sendRequest(request);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bridge.http).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://api.example.test/widgets?draft=true',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{"name":"CurlIt"}',
      bodyType: 'json',
      sslVerification: false,
    });
    expect(result).toMatchObject({
      status: 201,
      statusText: 'Created',
      body: '{"created":true}',
      cookies: [{ name: 'session', value: 'abc' }],
    });
  });

  it('serializes form-data into the IPC-compatible payload', async () => {
    bridge.http.mockResolvedValueOnce(httpResponse());
    const request = createDefaultRequest({
      id: 'desktop-form',
      method: 'POST',
      url: 'https://api.example.test/upload',
      body: {
        type: 'form-data',
        raw: '',
        formData: [
          createFormDataEntry({ key: 'title', value: 'Desktop upload' }),
          createFormDataEntry({ key: 'ignored', value: 'no', enabled: false }),
        ],
        urlencoded: [],
      },
    });

    await sendRequest(request);

    expect(bridge.http).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.example.test/upload',
      bodyType: 'form-data',
      formDataEntries: [{ key: 'title', value: 'Desktop upload', type: 'text' }],
    }));
  });

  it('uses desktop IPC for OAuth and propagates token-endpoint failures', async () => {
    bridge.oauthToken.mockResolvedValueOnce({
      __status: 200,
      access_token: 'desktop-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const config = {
      grantType: 'authorization_code' as const,
      authUrl: 'https://auth.example.test/authorize',
      tokenUrl: 'https://auth.example.test/token',
      clientId: 'curlit-client',
      clientSecret: 'secret',
      scope: 'read',
      callbackUrl: 'curlit://oauth/callback',
      clientAuthMethod: 'basic' as const,
    };

    await expect(fetchOAuth2Token(config, 'code-123', false)).resolves.toMatchObject({
      accessToken: 'desktop-token',
      expiresIn: 3600,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bridge.oauthToken).toHaveBeenCalledWith({
      tokenUrl: config.tokenUrl,
      grantType: 'authorization_code',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: 'read',
      sslVerification: false,
      clientAuthMethod: 'basic',
      code: 'code-123',
      redirectUri: 'curlit://oauth/callback',
    });

    bridge.oauthToken.mockResolvedValueOnce({ __status: 502, access_token: 'ignored' });
    await expect(fetchOAuth2Token(config, 'code-123')).rejects.toThrow('status 502');
  });

  it('uses desktop IPC for the GitHub device-flow transport', async () => {
    bridge.githubStatus.mockResolvedValueOnce({ configured: true });
    bridge.githubDeviceCode.mockResolvedValueOnce({
      __status: 200,
      device_code: 'device-1',
      user_code: 'USER-CODE',
      verification_uri: 'https://github.com/login/device',
      interval: 3,
      expires_in: 600,
    });
    bridge.githubDeviceToken.mockResolvedValueOnce({ access_token: 'ghs_desktop' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchSyncStatus()).resolves.toEqual({ configured: true });
    await expect(requestDeviceCode()).resolves.toEqual({
      deviceCode: 'device-1',
      userCode: 'USER-CODE',
      verificationUri: 'https://github.com/login/device',
      interval: 3,
      expiresIn: 600,
    });
    await expect(pollDeviceToken('device-1')).resolves.toEqual({
      status: 'ok',
      accessToken: 'ghs_desktop',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bridge.githubStatus).toHaveBeenCalledOnce();
    expect(bridge.githubDeviceCode).toHaveBeenCalledOnce();
    expect(bridge.githubDeviceToken).toHaveBeenCalledWith('device-1');
  });
});

describe('Electron WebSocket renderer lifecycle', () => {
  let bridge: DesktopTestBridge;

  beforeEach(() => {
    vi.resetModules();
    delete window.curlit;
    bridge = installDesktopBridge();
  });

  afterEach(() => {
    delete window.curlit;
    vi.restoreAllMocks();
  });

  it('tracks one shared event subscription, routes socket events, and closes the matching connection', async () => {
    const { useAppStore } = await import('../../store');
    const { connectWebSocket, disconnectWebSocket, isWebSocketConnected, sendWebSocketMessage } = await import('../websocket');
    const first = createDefaultRequest({
      id: 'desktop-ws-one',
      protocol: 'websocket',
      url: 'wss://echo.example.test/socket',
      headers: [createKeyValuePair({ key: 'X-Trace', value: 'one' })],
      sslVerification: false,
    });
    const second = createDefaultRequest({
      id: 'desktop-ws-two',
      protocol: 'websocket',
      url: 'wss://echo.example.test/second',
    });
    useAppStore.setState(state => ({
      requests: { ...state.requests, [first.id]: first, [second.id]: second },
      webSocketSessions: {},
    }));

    connectWebSocket(first, {}, {});
    connectWebSocket(second, {}, {});

    expect(bridge.onWsEvent).toHaveBeenCalledOnce();
    expect(bridge.wsConnect).toHaveBeenNthCalledWith(1, {
      id: first.id,
      url: first.url,
      headers: { 'X-Trace': 'one' },
      sslVerification: false,
    });
    expect(bridge.wsConnect).toHaveBeenNthCalledWith(2, {
      id: second.id,
      url: second.url,
      headers: {},
      sslVerification: true,
    });
    expect(useAppStore.getState().webSocketSessions[first.id]?.status).toBe('connecting');

    bridge.emitWsEvent({ id: first.id, type: 'connected' });
    bridge.emitWsEvent({ id: first.id, type: 'message', data: 'AQI=', isBinary: true, size: 2 });
    expect(isWebSocketConnected(first.id)).toBe(true);
    expect(useAppStore.getState().webSocketSessions[first.id]).toMatchObject({
      status: 'connected',
      messages: [expect.objectContaining({
        direction: 'received',
        data: '[Binary frame, 2 bytes]\nAQI=',
        isBinary: true,
        size: 2,
      })],
    });

    sendWebSocketMessage(first.id, 'hello from renderer');
    expect(bridge.wsSend).toHaveBeenCalledWith(first.id, 'hello from renderer');
    expect(useAppStore.getState().webSocketSessions[first.id]?.messages).toContainEqual(
      expect.objectContaining({ direction: 'sent', data: 'hello from renderer' }),
    );

    bridge.emitWsEvent({ id: first.id, type: 'closed', code: 1000, reason: 'done' });
    expect(useAppStore.getState().webSocketSessions[first.id]?.status).toBe('disconnected');
    expect(isWebSocketConnected(first.id)).toBe(false);

    disconnectWebSocket(second.id);
    expect(bridge.wsClose).toHaveBeenCalledWith(second.id);
    expect(isWebSocketConnected(second.id)).toBe(false);
  });
});
