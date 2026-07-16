/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');

function loadPreloadBridge() {
  let bridge;
  const contextBridge = {
    exposeInMainWorld: vi.fn((name, api) => {
      if (name === 'curlit') bridge = api;
    }),
  };
  const ipcRenderer = {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const originalLoad = Module._load;
  const resolved = require.resolve('../preload.cjs');

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return { contextBridge, ipcRenderer };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[resolved];
  try {
    require(resolved);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolved];
  }

  return { bridge, contextBridge, ipcRenderer };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Electron preload bridge', () => {
  it('exposes only the expected desktop transport methods', () => {
    const { bridge, contextBridge } = loadPreloadBridge();

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledOnce();
    expect(bridge).toEqual(expect.objectContaining({ isDesktop: true }));
    expect(Object.keys(bridge).sort()).toEqual([
      'githubDeviceCode',
      'githubDeviceToken',
      'githubStatus',
      'http',
      'isDesktop',
      'oauthToken',
      'onWsEvent',
      'version',
      'wsClose',
      'wsConnect',
      'wsSend',
    ]);
  });

  it('maps request/response and websocket calls to the narrow IPC channel set', () => {
    const { bridge, ipcRenderer } = loadPreloadBridge();
    const payload = { method: 'GET', url: 'https://api.example.test', headers: {} };

    bridge.version();
    bridge.http(payload);
    bridge.oauthToken({ tokenUrl: 'https://auth.example.test/token' });
    bridge.githubStatus();
    bridge.githubDeviceCode();
    bridge.githubDeviceToken('device-code');
    bridge.wsConnect({ id: 'socket-1', url: 'wss://echo.example.test', headers: {} });
    bridge.wsSend('socket-1', 'hello');
    bridge.wsClose('socket-1');

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['curlit:version'],
      ['curlit:http', payload],
      ['curlit:oauth-token', { tokenUrl: 'https://auth.example.test/token' }],
      ['curlit:github-status'],
      ['curlit:github-device-code'],
      ['curlit:github-device-token', 'device-code'],
    ]);
    expect(ipcRenderer.send.mock.calls).toEqual([
      ['curlit:ws-connect', { id: 'socket-1', url: 'wss://echo.example.test', headers: {} }],
      ['curlit:ws-send', { id: 'socket-1', data: 'hello' }],
      ['curlit:ws-close', 'socket-1'],
    ]);
  });

  it('forwards websocket events and removes the exact listener on unsubscribe', () => {
    const { bridge, ipcRenderer } = loadPreloadBridge();
    const callback = vi.fn();

    const unsubscribe = bridge.onWsEvent(callback);
    expect(ipcRenderer.on).toHaveBeenCalledOnce();
    const listener = ipcRenderer.on.mock.calls[0][1];
    const event = { id: 'socket-1', type: 'connected' };
    listener({ sender: 'ignored' }, event);

    expect(callback).toHaveBeenCalledWith(event);
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('curlit:ws-event', listener);
  });
});
