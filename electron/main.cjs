'use strict';

const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  abortNetworkRequestsForWebContents,
  closeAllNetworkRequests,
  closeAllWebSockets,
  closeWebSocketsForWebContents,
  registerIpcHandlers,
} = require('./ipc.cjs');

const APP_SCHEME = 'curlit';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;
const distDirectory = path.resolve(__dirname, '..', 'dist');
const MAX_EXTERNAL_URL_LENGTH = 16_384;

// A standard, secure custom scheme gives packaged renderer content a normal
// origin without granting the broad local-file access of file://. It must be
// registered before Electron's ready event.
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}]);

function parseUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EXTERNAL_URL_LENGTH) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackDevelopmentUrl(url) {
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isApplicationUrl(url) {
  return Boolean(
    url
    && url.protocol === `${APP_SCHEME}:`
    && url.hostname === APP_HOST
    && !url.username
    && !url.password
    && !url.port,
  );
}

/**
 * Map a request to one local production asset. This deliberately rejects
 * alternate hosts, encoded separators, and any path that escapes dist/.
 */
function resolveApplicationAssetPath(value) {
  const url = parseUrl(value);
  if (!isApplicationUrl(url)) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (!pathname || pathname === '/') pathname = '/index.html';
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) return null;

  const relativePath = pathname.slice(1);
  if (
    !relativePath
    || path.isAbsolute(relativePath)
    || relativePath.split('/').some((segment) => segment === '..')
  ) return null;

  const resolvedPath = path.resolve(distDirectory, relativePath);
  const relativeToDist = path.relative(distDirectory, resolvedPath);
  if (
    !relativeToDist
    || relativeToDist === '..'
    || relativeToDist.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToDist)
  ) return null;

  return resolvedPath;
}

function notFoundResponse() {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function handleApplicationProtocolRequest(request) {
  const filePath = resolveApplicationAssetPath(request?.url);
  if (!filePath) return notFoundResponse();

  try {
    return await net.fetch(pathToFileURL(filePath).toString());
  } catch {
    return notFoundResponse();
  }
}

// A packaged app must never trust a URL injected through the environment. The
// development server is useful only for unpackaged local development, and is
// deliberately restricted to a loopback origin.
const devUrl = !app.isPackaged ? parseUrl(process.env.CURLIT_DEV_URL) : null;
const isDev = isLoopbackDevelopmentUrl(devUrl);

/**
 * The renderer is trusted only while it is displaying our local production
 * bundle or the explicitly configured local development origin. Keeping this
 * check close to window creation also makes it the single policy used by IPC
 * and navigation guards.
 */
function isAllowedRendererUrl(value) {
  const url = parseUrl(value);
  if (!url) return false;

  if (isDev) {
    return url.protocol === devUrl.protocol && url.origin === devUrl.origin;
  }

  return isApplicationUrl(url) && url.pathname === '/index.html';
}

function isSafeExternalUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && (url.protocol === 'https:' || url.protocol === 'http:'));
}

function openExternalSafely(value) {
  if (!isSafeExternalUrl(value)) return;
  // shell.openExternal is asynchronous. Deliberately swallow failures here:
  // navigation has already been denied and there is no safe in-app fallback.
  void shell.openExternal(value).catch(() => {});
}

function isTrustedIpcSender(event) {
  const sender = event?.sender;
  if (!sender || (typeof sender.isDestroyed === 'function' && sender.isDestroyed())) return false;

  try {
    if (!isAllowedRendererUrl(sender.getURL())) return false;

    // IPC is intended for the top-level application frame only. This rejects a
    // compromised or unexpectedly embedded subframe even if it shares the
    // parent WebContents.
    const frame = event.senderFrame;
    if (frame) {
      if (frame.parent) return false;
      if (typeof frame.isDestroyed === 'function' && frame.isDestroyed()) return false;
      if (!isAllowedRendererUrl(frame.url)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function configurePermissionPolicy() {
  // CurlIt does not need browser-granted device, media, filesystem, or
  // notification permissions. Deny by default rather than inheriting a
  // Chromium/Electron default that could change in a future release.
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function guardNavigation(details) {
  const targetUrl = details?.url;
  if (isAllowedRendererUrl(targetUrl)) return;

  if (typeof details?.preventDefault === 'function') details.preventDefault();
  if (details?.isMainFrame && isSafeExternalUrl(targetUrl)) {
    openExternalSafely(targetUrl);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1013',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // OAuth and release links intentionally open in the user's browser. Only
    // http(s) targets are accepted so custom/file protocols cannot be invoked.
    openExternalSafely(url);
    return { action: 'deny' };
  });

  // Keep all content inside the trusted application document. Normal external
  // links are opened in the system browser; subframe navigation is simply
  // blocked. Redirects need their own guard because they bypass the first one.
  win.webContents.on('will-frame-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  const webContentsId = win.webContents.id;
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      closeWebSocketsForWebContents(webContentsId);
      abortNetworkRequestsForWebContents(webContentsId);
    }
  });
  win.webContents.once('destroyed', () => {
    closeWebSocketsForWebContents(webContentsId);
    abortNetworkRequestsForWebContents(webContentsId);
  });

  if (isDev) {
    void win.loadURL(devUrl.toString());
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadURL(APP_INDEX_URL);
  }
}

app.whenReady().then(() => {
  configurePermissionPolicy();
  protocol.handle(APP_SCHEME, handleApplicationProtocolRequest);
  // Register once for the lifetime of the main process. createWindow can run
  // again on macOS after the last window closes, but IPC handlers must not be
  // registered a second time.
  registerIpcHandlers(ipcMain, { isTrustedSender: isTrustedIpcSender });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  closeAllWebSockets();
  closeAllNetworkRequests();
});

app.on('window-all-closed', () => {
  closeAllWebSockets();
  closeAllNetworkRequests();
  if (process.platform !== 'darwin') app.quit();
});

module.exports = {
  _internal: {
    APP_INDEX_URL,
    isAllowedRendererUrl,
    isSafeExternalUrl,
    isTrustedIpcSender,
    resolveApplicationAssetPath,
    handleApplicationProtocolRequest,
  },
};
