/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadMainWithElectronMock() {
  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
  };
  class BrowserWindow {
    static instances = [];
    static getAllWindows = vi.fn(() => []);

    constructor(options) {
      this.options = options;
      this.webContents = {
        id: BrowserWindow.instances.length + 1,
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        openDevTools: vi.fn(),
      };
      this.loadFile = vi.fn(() => Promise.resolve());
      this.loadURL = vi.fn(() => Promise.resolve());
      this.on = vi.fn();
      BrowserWindow.instances.push(this);
    }
  }
  const ipcMain = {};
  const protocol = {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  };
  const net = { fetch: vi.fn(() => Promise.resolve(new Response('ok'))) };
  const session = {
    defaultSession: {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
    },
  };
  const shell = { openExternal: vi.fn(() => Promise.resolve()) };
  const ipc = {
    registerIpcHandlers: vi.fn(),
    closeAllWebSockets: vi.fn(),
    closeAllNetworkRequests: vi.fn(),
    closeWebSocketsForWebContents: vi.fn(),
    abortNetworkRequestsForWebContents: vi.fn(),
  };
  const originalLoad = Module._load;
  const resolved = require.resolve('../main.cjs');

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return {
      app, BrowserWindow, ipcMain, net, protocol, session, shell,
    };
    if (request === './ipc.cjs' && parent?.filename === resolved) return ipc;
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[resolved];
  let main;
  try {
    main = require(resolved);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolved];
  }

  return {
    app, BrowserWindow, ipc, main, net, protocol, session, shell,
  };
}

async function settleMainStartup() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Electron main-process security policy', () => {
  it('uses a sandboxed renderer, registers IPC once, and keeps macOS reactivation safe', async () => {
    const originalDevUrl = process.env.CURLIT_DEV_URL;
    delete process.env.CURLIT_DEV_URL;
    try {
      const { app, BrowserWindow, ipc, protocol, session } = loadMainWithElectronMock();
      await settleMainStartup();

      expect(BrowserWindow.instances).toHaveLength(1);
      expect(BrowserWindow.instances[0].options.webPreferences).toMatchObject({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      });
      expect(ipc.registerIpcHandlers).toHaveBeenCalledTimes(1);
      expect(ipc.registerIpcHandlers).toHaveBeenCalledWith({}, expect.objectContaining({
        isTrustedSender: expect.any(Function),
      }));
      expect(session.defaultSession.setPermissionCheckHandler).toHaveBeenCalledWith(expect.any(Function));
      expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledWith(expect.any(Function));
      expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([{
        scheme: 'curlit',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
        },
      }]);
      expect(protocol.handle).toHaveBeenCalledWith('curlit', expect.any(Function));

      const activate = app.on.mock.calls.find(([event]) => event === 'activate')?.[1];
      expect(activate).toEqual(expect.any(Function));
      activate();
      expect(BrowserWindow.instances).toHaveLength(2);
      expect(ipc.registerIpcHandlers).toHaveBeenCalledTimes(1);
    } finally {
      if (originalDevUrl === undefined) delete process.env.CURLIT_DEV_URL;
      else process.env.CURLIT_DEV_URL = originalDevUrl;
    }
  });

  it('only trusts the bundled renderer and restricts external navigation to http(s)', async () => {
    const originalDevUrl = process.env.CURLIT_DEV_URL;
    delete process.env.CURLIT_DEV_URL;
    try {
      const { BrowserWindow, main, net, protocol, shell } = loadMainWithElectronMock();
      await settleMainStartup();
      const indexUrl = main._internal.APP_INDEX_URL;
      const { handleApplicationProtocolRequest, isAllowedRendererUrl, isSafeExternalUrl, isTrustedIpcSender, resolveApplicationAssetPath } = main._internal;

      expect(isAllowedRendererUrl(indexUrl)).toBe(true);
      expect(isAllowedRendererUrl('curlit://app/assets/index.js')).toBe(false);
      expect(isAllowedRendererUrl('curlit://other/index.html')).toBe(false);
      expect(isAllowedRendererUrl('file:///C:/CurlIt/resources/app.asar/dist/index.html')).toBe(false);
      expect(isAllowedRendererUrl('https://curlit.example.test')).toBe(false);
      expect(isSafeExternalUrl('https://curlit.example.test/docs')).toBe(true);
      expect(isSafeExternalUrl('http://127.0.0.1:3000/callback')).toBe(true);
      expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
      expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);

      const trustedEvent = {
        sender: { getURL: () => indexUrl, isDestroyed: () => false },
        senderFrame: { url: indexUrl, parent: null, isDestroyed: () => false },
      };
      expect(isTrustedIpcSender(trustedEvent)).toBe(true);
      expect(isTrustedIpcSender({
        ...trustedEvent,
        senderFrame: { url: indexUrl, parent: {}, isDestroyed: () => false },
      })).toBe(false);

      const expectedIndexPath = resolve(root, 'dist', 'index.html');
      expect(resolveApplicationAssetPath(indexUrl)).toBe(expectedIndexPath);
      expect(resolveApplicationAssetPath('curlit://app/%5C..%5CREADME.md')).toBeNull();
      expect(resolveApplicationAssetPath('curlit://other/index.html')).toBeNull();

      const protocolHandler = protocol.handle.mock.calls[0][1];
      await protocolHandler({ url: indexUrl });
      expect(net.fetch).toHaveBeenCalledWith(expect.stringContaining('/dist/index.html'));
      const blockedResponse = await handleApplicationProtocolRequest({ url: 'curlit://other/index.html' });
      expect(blockedResponse.status).toBe(404);
      expect(isTrustedIpcSender({
        ...trustedEvent,
        sender: { getURL: () => 'https://evil.example.test', isDestroyed: () => false },
      })).toBe(false);

      const windowHandler = BrowserWindow.instances[0].webContents.setWindowOpenHandler.mock.calls[0][0];
      expect(windowHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(windowHandler({ url: 'https://curlit.example.test/docs' })).toEqual({ action: 'deny' });
      expect(shell.openExternal).toHaveBeenCalledWith('https://curlit.example.test/docs');
    } finally {
      if (originalDevUrl === undefined) delete process.env.CURLIT_DEV_URL;
      else process.env.CURLIT_DEV_URL = originalDevUrl;
    }
  });

  it('retains the loopback-only development renderer policy', async () => {
    const originalDevUrl = process.env.CURLIT_DEV_URL;
    process.env.CURLIT_DEV_URL = 'http://localhost:5173';
    try {
      const { BrowserWindow, main } = loadMainWithElectronMock();
      await settleMainStartup();

      expect(BrowserWindow.instances[0].loadURL).toHaveBeenCalledWith('http://localhost:5173/');
      expect(main._internal.isAllowedRendererUrl('http://localhost:5173/assets/app.js')).toBe(true);
      expect(main._internal.isAllowedRendererUrl('http://127.0.0.1:5173/index.html')).toBe(false);
      expect(main._internal.isAllowedRendererUrl('https://localhost:5173/index.html')).toBe(false);
      expect(main._internal.isAllowedRendererUrl('curlit://app/index.html')).toBe(false);
    } finally {
      if (originalDevUrl === undefined) delete process.env.CURLIT_DEV_URL;
      else process.env.CURLIT_DEV_URL = originalDevUrl;
    }
  });
});
