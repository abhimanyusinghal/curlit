'use strict';

const crypto = require('crypto');
const { Agent } = require('undici');
const { WebSocket: WsClient } = require('ws');

const AGENT_VERSION = '1.3.0';

// ─── Active WebSocket connections ──────────────────────────────────────────
// Keyed by the renderer-generated connectionId so the renderer can send/close
// a specific connection without exposing the underlying socket object.
const wsConnections = new Map();

function closeAllWebSockets() {
  for (const ws of wsConnections.values()) {
    try { ws.close(); } catch { /* already closed */ }
  }
  wsConnections.clear();
}

// ─── multipart/form-data builder (mirrors server/proxy.js) ─────────────────
function buildMultipartBody(entries) {
  const boundary = `----CurlItBoundary${crypto.randomUUID().replace(/-/g, '')}`;
  const parts = [];

  for (const entry of entries) {
    if (entry.type === 'file' && entry.base64 != null) {
      const fileBuffer = Buffer.from(entry.base64, 'base64');
      const fileName = entry.fileName || 'file';
      const contentType = entry.contentType || 'application/octet-stream';
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${entry.key}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
        ),
        fileBuffer,
        Buffer.from('\r\n'),
      );
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${entry.key}"\r\n\r\n${entry.value}\r\n`,
        ),
      );
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    buffer: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ─── HTTP proxy (mirrors /api/proxy) ────────────────────────────────────────
async function handleHttpRequest(payload) {
  const { method, url, headers, body, bodyType, formDataEntries, binary, sslVerification } = payload;
  if (!url) return { error: 'URL is required' };

  try {
    const fetchOptions = {
      method: method || 'GET',
      headers: { ...headers },
    };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(fetchOptions.method)) {
      if (bodyType === 'binary' && binary && binary.base64 != null) {
        fetchOptions.body = Buffer.from(binary.base64, 'base64');
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = binary.fileType || 'application/octet-stream';
        }
      } else if (bodyType === 'form-data' && Array.isArray(formDataEntries)) {
        const { buffer, contentType } = buildMultipartBody(formDataEntries);
        fetchOptions.body = buffer;
        fetchOptions.headers['Content-Type'] = contentType;
      } else if (bodyType === 'form-data' && typeof body === 'object' && body !== null) {
        const formBody = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => {
          formBody.append(key, String(value));
        });
        fetchOptions.body = formBody.toString();
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (body && typeof body === 'string') {
        fetchOptions.body = body;
      } else if (body) {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    if (sslVerification === false) {
      fetchOptions.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const elapsed = Date.now() - startTime;

    const responseText = await response.text();

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const cookies = [];
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      setCookieHeader.split(',').map(s => s.trim()).forEach(cookie => {
        const parts = cookie.split(';')[0];
        const eqIdx = parts.indexOf('=');
        if (eqIdx > 0) {
          cookies.push({
            name: parts.substring(0, eqIdx).trim(),
            value: parts.substring(eqIdx + 1).trim(),
          });
        }
      });
    }

    let responseBody = responseText;
    try {
      responseBody = JSON.stringify(JSON.parse(responseText), null, 2);
    } catch {
      // Not JSON; keep raw text.
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      cookies,
      time: elapsed,
    };
  } catch (error) {
    const cause = error.cause || error;
    const code = cause.code || '';
    const causeMessage = cause.message || error.message || 'Unknown error';
    const errorDetail = code ? `Error: ${causeMessage}` : `Error: ${error.message || 'Unknown error'}`;
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: errorDetail,
      cookies: [],
      time: 0,
    };
  }
}

// ─── OAuth 2.0 token exchange (mirrors /api/oauth/token) ───────────────────
async function handleOAuthToken(payload) {
  const { tokenUrl, grantType, clientId, clientSecret, code, redirectUri, scope, sslVerification, clientAuthMethod } = payload;
  if (!tokenUrl) return { error: 'Token URL is required' };
  if (!grantType) return { error: 'Grant type is required' };
  if (!clientId) return { error: 'Client ID is required' };

  try {
    const params = new URLSearchParams();
    params.append('grant_type', grantType);
    const fetchHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (clientAuthMethod === 'basic' && clientSecret) {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      fetchHeaders['Authorization'] = `Basic ${credentials}`;
    } else {
      params.append('client_id', clientId);
      if (clientSecret) params.append('client_secret', clientSecret);
    }

    if (grantType === 'authorization_code') {
      if (code) params.append('code', code);
      if (redirectUri) params.append('redirect_uri', redirectUri);
    }

    if (scope) params.append('scope', scope);

    const fetchOptions = {
      method: 'POST',
      headers: fetchHeaders,
      body: params.toString(),
    };
    if (sslVerification === false) {
      fetchOptions.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }

    const response = await fetch(tokenUrl, fetchOptions);
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (contentType.includes('application/x-www-form-urlencoded') || text.includes('access_token=')) {
        data = Object.fromEntries(new URLSearchParams(text));
      } else {
        data = { error: 'Invalid response from token endpoint', raw: text };
      }
    }
    return { __status: response.status, ...data };
  } catch (error) {
    const cause = error.cause || error;
    return { __status: 500, error: cause.message || error.message || 'Token exchange failed' };
  }
}

// ─── GitHub device flow (mirrors /api/github/*) ─────────────────────────────
function githubStatus() {
  return { configured: !!process.env.GITHUB_CLIENT_ID };
}

async function githubDeviceCode() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return { __status: 501, error: 'GITHUB_CLIENT_ID not configured' };
  try {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'gist' }).toString(),
    });
    const data = await response.json();
    return { __status: response.status, ...data };
  } catch (error) {
    const cause = error.cause || error;
    return { __status: 500, error: cause.message || 'Device code request failed' };
  }
}

async function githubDeviceToken(deviceCode) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return { __status: 501, error: 'GITHUB_CLIENT_ID not configured' };
  if (!deviceCode) return { __status: 400, error: 'deviceCode is required' };
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    });
    const data = await response.json();
    return { __status: response.status, ...data };
  } catch (error) {
    const cause = error.cause || error;
    return { __status: 500, error: cause.message || 'Device token poll failed' };
  }
}

// ─── WebSocket relay (mirrors /api/ws-proxy) ────────────────────────────────
// The renderer owns a connectionId; we keep a map and forward events back via
// webContents.send('curlit:ws-event', { id, ...event }).
function wsConnect(win, { id, url, headers, sslVerification }) {
  if (wsConnections.has(id)) {
    try { wsConnections.get(id).close(); } catch { /* already closed */ }
    wsConnections.delete(id);
  }

  const wsOptions = {};
  if (headers && Object.keys(headers).length > 0) wsOptions.headers = headers;
  if (sslVerification === false) wsOptions.rejectUnauthorized = false;

  let ws;
  try {
    ws = new WsClient(url, wsOptions);
  } catch (err) {
    win.webContents.send('curlit:ws-event', { id, type: 'error', message: err.message });
    return;
  }

  wsConnections.set(id, ws);

  ws.on('open', () => {
    win.webContents.send('curlit:ws-event', { id, type: 'connected' });
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const base64 = Buffer.from(data).toString('base64');
      win.webContents.send('curlit:ws-event', {
        id, type: 'message', data: base64, isBinary: true, size: data.byteLength,
      });
    } else {
      win.webContents.send('curlit:ws-event', {
        id, type: 'message', data: data.toString(),
      });
    }
  });

  ws.on('close', (code, reason) => {
    win.webContents.send('curlit:ws-event', {
      id, type: 'closed', code, reason: reason ? reason.toString() : '',
    });
    wsConnections.delete(id);
  });

  ws.on('error', (err) => {
    win.webContents.send('curlit:ws-event', { id, type: 'error', message: err.message });
    wsConnections.delete(id);
  });
}

function wsSend(id, data) {
  const ws = wsConnections.get(id);
  if (ws && ws.readyState === WsClient.OPEN) ws.send(data);
}

function wsClose(id) {
  const ws = wsConnections.get(id);
  if (ws) {
    try { ws.close(); } catch { /* already closed */ }
    wsConnections.delete(id);
  }
}

// ─── IPC registration ──────────────────────────────────────────────────────
function registerIpcHandlers(ipc, win) {
  ipc.handle('curlit:http', (_e, payload) => handleHttpRequest(payload));
  ipc.handle('curlit:oauth-token', (_e, payload) => handleOAuthToken(payload));
  ipc.handle('curlit:github-status', () => githubStatus());
  ipc.handle('curlit:github-device-code', () => githubDeviceCode());
  ipc.handle('curlit:github-device-token', (_e, deviceCode) => githubDeviceToken(deviceCode));
  ipc.handle('curlit:version', () => ({ version: AGENT_VERSION }));

  ipc.on('curlit:ws-connect', (_e, payload) => wsConnect(win, payload));
  ipc.on('curlit:ws-send', (_e, { id, data }) => wsSend(id, data));
  ipc.on('curlit:ws-close', (_e, id) => wsClose(id));
}

module.exports = { registerIpcHandlers, closeAllWebSockets };
