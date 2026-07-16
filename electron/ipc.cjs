'use strict';

const crypto = require('crypto');
const { Agent } = require('undici');
const { WebSocket: WsClient } = require('ws');
const { version: APP_VERSION } = require('../package.json');


// Keep renderer-controlled data and network activity bounded. CurlIt is an API
// client, so these limits are intentionally generous while still preventing a
// page from making the main process retain unbounded buffers or sockets.
const MAX_URL_LENGTH = 16_384;
const MAX_HEADERS = 100;
const MAX_HEADER_BYTES = 128 * 1024;
const MAX_REQUEST_BODY_BYTES = 50 * 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_CHUNKS = 10_000;
const HTTP_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_NETWORK_REQUESTS = 20;
const MAX_WS_CONNECTIONS_PER_RENDERER = 25;
const MAX_WS_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_WS_QUEUED_MESSAGES = 1_000;
const WS_HANDSHAKE_TIMEOUT_MS = 30_000;
const MAX_CONNECTION_ID_LENGTH = 128;

const HTTP_METHOD_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CONNECTION_ID_RE = /^[A-Za-z0-9._:-]+$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// Keyed by "webContents id + connection id". Keeping the owner in the key
// prevents one renderer window from sending to or replacing another window's
// socket merely by reusing its connection id.
const wsConnections = new Map();
const activeNetworkRequests = new Map();
let registeredIpc = null;
let isTrustedSender = () => false;

function validationError(message) {
  const error = new Error(message);
  error.name = 'ValidationError';
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function assertString(value, field, maxBytes, { allowEmpty = true } = {}) {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  if (!allowEmpty && value.length === 0) throw validationError(`${field} is required`);
  if (byteLength(value) > maxBytes) throw validationError(`${field} exceeds the allowed size`);
  return value;
}

function assertNoLineBreaks(value, field) {
  if (/[\r\n]/.test(value)) throw validationError(`${field} must not contain line breaks`);
  return value;
}

function parseNetworkUrl(value, protocols, field) {
  const raw = assertString(value, field, MAX_URL_LENGTH, { allowEmpty: false });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw validationError(`${field} must be a valid URL`);
  }

  if (!protocols.includes(url.protocol)) {
    throw validationError(`${field} must use ${protocols.join(' or ')}`);
  }
  return url.toString();
}

function validateBoolean(value, field, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') throw validationError(`${field} must be a boolean`);
  return value;
}

function validateHeaders(value) {
  if (value === undefined || value === null) return Object.create(null);
  if (!isRecord(value)) throw validationError('headers must be an object');

  const entries = Object.entries(value);
  if (entries.length > MAX_HEADERS) throw validationError(`headers cannot contain more than ${MAX_HEADERS} entries`);

  const headers = Object.create(null);
  let totalBytes = 0;
  for (const [name, headerValue] of entries) {
    if (!HEADER_NAME_RE.test(name)) throw validationError(`Invalid header name: ${name}`);
    const normalizedValue = assertNoLineBreaks(
      assertString(headerValue, `Header ${name}`, MAX_HEADER_BYTES),
      `Header ${name}`,
    );
    totalBytes += byteLength(name) + byteLength(normalizedValue);
    if (totalBytes > MAX_HEADER_BYTES) throw validationError('headers exceed the allowed size');
    headers[name] = normalizedValue;
  }
  return headers;
}

function hasHeader(headers, name) {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === normalized);
}

function validateConnectionId(value) {
  const id = assertString(value, 'connection id', MAX_CONNECTION_ID_LENGTH, { allowEmpty: false });
  if (!CONNECTION_ID_RE.test(id)) throw validationError('connection id contains unsupported characters');
  return id;
}

function decodeBase64(value, field) {
  const encoded = assertString(value, field, Math.ceil((MAX_REQUEST_BODY_BYTES * 4) / 3) + 4);
  if (encoded.length % 4 !== 0 || !BASE64_RE.test(encoded)) {
    throw validationError(`${field} must be valid base64`);
  }

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length > MAX_REQUEST_BODY_BYTES) {
    throw validationError(`${field} exceeds the ${MAX_REQUEST_BODY_BYTES / (1024 * 1024)} MiB limit`);
  }
  return decoded;
}

function escapeQuotedHeaderValue(value) {
  return value.replace(/["\\]/g, '\\$&');
}

function validateMultipartEntries(entries) {
  if (!Array.isArray(entries)) throw validationError('formDataEntries must be an array');
  if (entries.length > MAX_HEADERS) throw validationError(`formDataEntries cannot contain more than ${MAX_HEADERS} entries`);

  let totalBytes = 0;
  return entries.map((entry, index) => {
    if (!isRecord(entry)) throw validationError(`formDataEntries[${index}] must be an object`);
    const key = assertNoLineBreaks(
      assertString(entry.key, `formDataEntries[${index}].key`, 4 * 1024, { allowEmpty: false }),
      `formDataEntries[${index}].key`,
    );
    if (entry.type !== 'text' && entry.type !== 'file') {
      throw validationError(`formDataEntries[${index}].type must be text or file`);
    }

    if (entry.type === 'file') {
      const fileName = assertNoLineBreaks(
        assertString(entry.fileName || 'file', `formDataEntries[${index}].fileName`, 4 * 1024),
        `formDataEntries[${index}].fileName`,
      );
      const contentType = assertNoLineBreaks(
        assertString(entry.contentType || 'application/octet-stream', `formDataEntries[${index}].contentType`, 1024),
        `formDataEntries[${index}].contentType`,
      );
      const fileBuffer = decodeBase64(entry.base64, `formDataEntries[${index}].base64`);
      totalBytes += fileBuffer.length + byteLength(key) + byteLength(fileName) + byteLength(contentType);
      if (totalBytes > MAX_REQUEST_BODY_BYTES) throw validationError('multipart body exceeds the allowed size');
      return { type: 'file', key, fileName, contentType, fileBuffer };
    }

    const textValue = assertString(entry.value, `formDataEntries[${index}].value`, MAX_REQUEST_BODY_BYTES);
    totalBytes += byteLength(key) + byteLength(textValue);
    if (totalBytes > MAX_REQUEST_BODY_BYTES) throw validationError('multipart body exceeds the allowed size');
    return { type: 'text', key, value: textValue };
  });
}

function serializeJsonBody(value) {
  if (value === undefined || value === null) return undefined;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof serialized !== 'string') throw validationError('body must be JSON-serializable');
  if (byteLength(serialized) > MAX_REQUEST_BODY_BYTES) {
    throw validationError(`body exceeds the ${MAX_REQUEST_BODY_BYTES / (1024 * 1024)} MiB limit`);
  }
  return serialized;
}

function serializeLegacyFormBody(value) {
  if (!isRecord(value)) throw validationError('form-data body must be an object');
  const entries = Object.entries(value);
  if (entries.length > MAX_HEADERS) throw validationError(`form-data body cannot contain more than ${MAX_HEADERS} entries`);

  const form = new URLSearchParams();
  let totalBytes = 0;
  for (const [key, entryValue] of entries) {
    const normalizedKey = assertString(key, 'form-data key', 4 * 1024, { allowEmpty: false });
    if (!['string', 'number', 'boolean'].includes(typeof entryValue) && entryValue !== null) {
      throw validationError(`form-data value for ${key} must be a primitive`);
    }
    const normalizedValue = String(entryValue ?? '');
    totalBytes += byteLength(normalizedKey) + byteLength(normalizedValue);
    if (totalBytes > MAX_REQUEST_BODY_BYTES) throw validationError('form-data body exceeds the allowed size');
    form.append(normalizedKey, normalizedValue);
  }
  return form.toString();
}

function validateHttpPayload(payload) {
  if (!isRecord(payload)) throw validationError('HTTP payload must be an object');

  const methodInput = payload.method === undefined ? 'GET' : assertString(payload.method, 'method', 32, { allowEmpty: false });
  if (!HTTP_METHOD_RE.test(methodInput)) throw validationError('method is invalid');
  const method = methodInput.toUpperCase();
  const bodyType = payload.bodyType === undefined ? undefined : assertString(payload.bodyType, 'bodyType', 64);
  const request = {
    method,
    url: parseNetworkUrl(payload.url, ['http:', 'https:'], 'url'),
    headers: validateHeaders(payload.headers),
    sslVerification: validateBoolean(payload.sslVerification, 'sslVerification', true),
    bodyType,
  };

  if (bodyType === 'binary') {
    if (!isRecord(payload.binary)) throw validationError('binary must be an object');
    request.binary = {
      buffer: decodeBase64(payload.binary.base64, 'binary.base64'),
      fileType: assertNoLineBreaks(
        assertString(payload.binary.fileType || 'application/octet-stream', 'binary.fileType', 1024),
        'binary.fileType',
      ),
    };
  } else if (bodyType === 'form-data' && payload.formDataEntries !== undefined) {
    request.multipart = validateMultipartEntries(payload.formDataEntries);
  } else if (bodyType === 'form-data' && payload.body !== undefined && payload.body !== null) {
    request.legacyFormBody = serializeLegacyFormBody(payload.body);
  } else {
    request.serializedBody = serializeJsonBody(payload.body);
  }

  return request;
}

function validateOAuthPayload(payload) {
  if (!isRecord(payload)) throw validationError('OAuth payload must be an object');
  const grantType = assertString(payload.grantType, 'grantType', 512, { allowEmpty: false });
  const clientId = assertString(payload.clientId, 'clientId', 32 * 1024, { allowEmpty: false });
  const clientAuthMethod = payload.clientAuthMethod === undefined ? 'post' : payload.clientAuthMethod;
  if (clientAuthMethod !== 'basic' && clientAuthMethod !== 'post') {
    throw validationError('clientAuthMethod must be basic or post');
  }

  const optionalString = (value, field, limit) => (
    value === undefined || value === null ? undefined : assertString(value, field, limit)
  );
  return {
    tokenUrl: parseNetworkUrl(payload.tokenUrl, ['http:', 'https:'], 'tokenUrl'),
    grantType,
    clientId,
    clientSecret: optionalString(payload.clientSecret, 'clientSecret', 64 * 1024),
    code: optionalString(payload.code, 'code', 64 * 1024),
    redirectUri: optionalString(payload.redirectUri, 'redirectUri', MAX_URL_LENGTH),
    scope: optionalString(payload.scope, 'scope', 32 * 1024),
    sslVerification: validateBoolean(payload.sslVerification, 'sslVerification', true),
    clientAuthMethod,
  };
}

function validateWsConnectPayload(payload) {
  if (!isRecord(payload)) throw validationError('WebSocket payload must be an object');
  return {
    id: validateConnectionId(payload.id),
    url: parseNetworkUrl(payload.url, ['ws:', 'wss:'], 'url'),
    headers: validateHeaders(payload.headers),
    sslVerification: validateBoolean(payload.sslVerification, 'sslVerification', true),
  };
}

function buildMultipartBody(entries) {
  const boundary = `----CurlItBoundary${crypto.randomUUID().replace(/-/g, '')}`;
  const parts = [];

  for (const entry of entries) {
    const name = escapeQuotedHeaderValue(entry.key);
    if (entry.type === 'file') {
      const fileName = escapeQuotedHeaderValue(entry.fileName);
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fileName}"\r\nContent-Type: ${entry.contentType}\r\n\r\n`,
        ),
        entry.fileBuffer,
        Buffer.from('\r\n'),
      );
    } else {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${entry.value}\r\n`));
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    buffer: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function makeRequestAbortSignal(externalSignal) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), HTTP_TIMEOUT_MS);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
    abort() {
      controller.abort();
    },
  };
}

async function readResponseText(response, requestSignal) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BODY_BYTES) {
    requestSignal.abort();
    throw validationError(`Response body exceeds the ${MAX_RESPONSE_BODY_BYTES / (1024 * 1024)} MiB limit`);
  }
  if (!response.body) return '';

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of response.body) {
    if (chunks.length >= MAX_RESPONSE_CHUNKS) {
      requestSignal.abort();
      throw validationError('Response contains too many chunks');
    }
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
      requestSignal.abort();
      throw validationError(`Response body exceeds the ${MAX_RESPONSE_BODY_BYTES / (1024 * 1024)} MiB limit`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

async function fetchTextWithLimits(url, options, externalSignal) {
  const requestSignal = makeRequestAbortSignal(externalSignal);
  try {
    const response = await fetch(url, { ...options, signal: requestSignal.signal });
    const text = await readResponseText(response, requestSignal);
    return { response, text };
  } finally {
    requestSignal.dispose();
  }
}

function extractCookies(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  const cookies = [];
  for (const header of setCookies) {
    const firstPart = header.split(';', 1)[0];
    const equalsIndex = firstPart.indexOf('=');
    if (equalsIndex > 0) {
      cookies.push({
        name: firstPart.slice(0, equalsIndex).trim(),
        value: firstPart.slice(equalsIndex + 1).trim(),
      });
    }
  }
  return cookies;
}

function formatNetworkError(error) {
  const cause = error?.cause || error;
  const message = cause?.message || error?.message || 'Unknown error';
  return `Error: ${message}`;
}

function closeDispatcher(dispatcher) {
  if (!dispatcher) return Promise.resolve();
  return dispatcher.close().catch(() => {});
}

// ─── HTTP proxy (mirrors /api/proxy) ────────────────────────────────────────
async function handleValidatedHttpRequest(request, externalSignal) {
  const startedAt = Date.now();
  let dispatcher;
  try {
    const fetchOptions = {
      method: request.method,
      headers: request.headers,
    };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.binary) {
        fetchOptions.body = request.binary.buffer;
        if (!hasHeader(request.headers, 'content-type')) fetchOptions.headers['Content-Type'] = request.binary.fileType;
      } else if (request.multipart) {
        const { buffer, contentType } = buildMultipartBody(request.multipart);
        fetchOptions.body = buffer;
        fetchOptions.headers['Content-Type'] = contentType;
      } else if (request.legacyFormBody !== undefined) {
        fetchOptions.body = request.legacyFormBody;
        if (!hasHeader(request.headers, 'content-type')) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (request.serializedBody !== undefined) {
        fetchOptions.body = request.serializedBody;
      }
    }

    if (!request.sslVerification) {
      dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
      fetchOptions.dispatcher = dispatcher;
    }

    const { response, text } = await fetchTextWithLimits(request.url, fetchOptions, externalSignal);
    const headers = Object.create(null);
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Non-JSON response bodies are shown as-is.
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      cookies: extractCookies(response),
      time: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: formatNetworkError(error),
      cookies: [],
      time: Date.now() - startedAt,
    };
  } finally {
    await closeDispatcher(dispatcher);
  }
}

// ─── OAuth 2.0 token exchange (mirrors /api/oauth/token) ───────────────────
async function handleOAuthToken(payload, externalSignal) {
  let dispatcher;
  try {
    const request = validateOAuthPayload(payload);
    const params = new URLSearchParams();
    params.append('grant_type', request.grantType);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (request.clientAuthMethod === 'basic' && request.clientSecret) {
      const credentials = Buffer.from(`${request.clientId}:${request.clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    } else {
      params.append('client_id', request.clientId);
      if (request.clientSecret) params.append('client_secret', request.clientSecret);
    }

    if (request.grantType === 'authorization_code') {
      if (request.code) params.append('code', request.code);
      if (request.redirectUri) params.append('redirect_uri', request.redirectUri);
    }
    if (request.scope) params.append('scope', request.scope);

    const fetchOptions = { method: 'POST', headers, body: params.toString() };
    if (!request.sslVerification) {
      dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
      fetchOptions.dispatcher = dispatcher;
    }

    const { response, text } = await fetchTextWithLimits(request.tokenUrl, fetchOptions, externalSignal);
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
    return { ...data, __status: response.status };
  } catch (error) {
    return { __status: error?.name === 'ValidationError' ? 400 : 500, error: formatNetworkError(error) };
  } finally {
    await closeDispatcher(dispatcher);
  }
}

// ─── GitHub device flow (mirrors /api/github/*) ─────────────────────────────
function githubStatus() {
  return { configured: Boolean(process.env.GITHUB_CLIENT_ID) };
}

async function githubDeviceCode(externalSignal) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return { __status: 501, error: 'GITHUB_CLIENT_ID not configured' };
  try {
    const { response, text } = await fetchTextWithLimits('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'gist' }).toString(),
    }, externalSignal);
    const data = JSON.parse(text);
    return { ...data, __status: response.status };
  } catch (error) {
    return { __status: 500, error: formatNetworkError(error) };
  }
}

async function githubDeviceToken(deviceCode, externalSignal) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return { __status: 501, error: 'GITHUB_CLIENT_ID not configured' };
  try {
    const code = assertString(deviceCode, 'deviceCode', 8 * 1024, { allowEmpty: false });
    const { response, text } = await fetchTextWithLimits('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    }, externalSignal);
    const data = JSON.parse(text);
    return { ...data, __status: response.status };
  } catch (error) {
    return { __status: error?.name === 'ValidationError' ? 400 : 500, error: formatNetworkError(error) };
  }
}

function webContentsId(webContentsOrId) {
  if (typeof webContentsOrId === 'number' && Number.isInteger(webContentsOrId)) return String(webContentsOrId);
  if (typeof webContentsOrId === 'string' && webContentsOrId.length > 0) return webContentsOrId;
  if (webContentsOrId && (typeof webContentsOrId.id === 'number' || typeof webContentsOrId.id === 'string')) {
    return String(webContentsOrId.id);
  }
  return null;
}

function connectionKey(ownerId, id) {
  return `${ownerId}\u0000${id}`;
}

function isCurrentConnection(record) {
  return wsConnections.get(record.key) === record;
}

function isDestroyed(webContents) {
  return !webContents || (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed());
}

function canSendTo(webContents, ipcEvent) {
  if (isDestroyed(webContents)) return false;
  try {
    return Boolean(isTrustedSender(ipcEvent || { sender: webContents }));
  } catch {
    return false;
  }
}

function safeSend(webContents, channel, payload, ipcEvent) {
  if (!canSendTo(webContents, ipcEvent)) return false;
  try {
    webContents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

function userFacingError(error) {
  const message = error?.message || String(error || 'Unknown error');
  return message.slice(0, 1_024);
}

function removeWsConnection(record, { terminate = false } = {}) {
  if (isCurrentConnection(record)) wsConnections.delete(record.key);
  if (record.pendingMessages) {
    record.pendingMessages.length = 0;
    record.queuedBytes = 0;
  }
  const socket = record.socket;
  if (!socket) return;
  try {
    if (terminate && typeof socket.terminate === 'function') socket.terminate();
    else socket.close();
  } catch {
    // The socket can already be closed while a replacement is being created.
  }
}

function emitWsEvent(record, event) {
  if (!isCurrentConnection(record)) return false;
  if (safeSend(record.webContents, 'curlit:ws-event', { id: record.id, ...event }, record.ipcEvent)) return true;
  removeWsConnection(record, { terminate: true });
  return false;
}

function countConnectionsForOwner(ownerId) {
  let count = 0;
  for (const record of wsConnections.values()) {
    if (record.ownerId === ownerId) count += 1;
  }
  return count;
}

function sendWsValidationError(webContents, id, error, ipcEvent) {
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_CONNECTION_ID_LENGTH) return;
  safeSend(webContents, 'curlit:ws-event', { id, type: 'error', message: userFacingError(error) }, ipcEvent);
}

function sendWebSocketData(record, data) {
  if (!isCurrentConnection(record) || record.socket.readyState !== WsClient.OPEN) return false;
  try {
    record.socket.send(data, (error) => {
      if (!error || !isCurrentConnection(record)) return;
      emitWsEvent(record, { type: 'error', message: userFacingError(error) });
      removeWsConnection(record, { terminate: true });
    });
    return true;
  } catch (error) {
    if (!isCurrentConnection(record)) return false;
    emitWsEvent(record, { type: 'error', message: userFacingError(error) });
    removeWsConnection(record, { terminate: true });
    return false;
  }
}

// ─── WebSocket relay (mirrors /api/ws-proxy) ────────────────────────────────
function wsConnect(ipcEvent, payload) {
  const webContents = ipcEvent?.sender;
  let request;
  try {
    request = validateWsConnectPayload(payload);
  } catch (error) {
    sendWsValidationError(webContents, payload?.id, error, ipcEvent);
    return;
  }

  const ownerId = webContentsId(webContents);
  if (!ownerId) {
    sendWsValidationError(webContents, request.id, validationError('Renderer is no longer available'), ipcEvent);
    return;
  }

  const key = connectionKey(ownerId, request.id);
  const existing = wsConnections.get(key);
  if (existing) removeWsConnection(existing, { terminate: true });

  if (countConnectionsForOwner(ownerId) >= MAX_WS_CONNECTIONS_PER_RENDERER) {
    sendWsValidationError(webContents, request.id, validationError(`Only ${MAX_WS_CONNECTIONS_PER_RENDERER} WebSocket connections are allowed at once`), ipcEvent);
    return;
  }

  const options = {
    headers: request.headers,
    handshakeTimeout: WS_HANDSHAKE_TIMEOUT_MS,
    maxPayload: MAX_WS_MESSAGE_BYTES,
  };
  if (!request.sslVerification) options.rejectUnauthorized = false;

  let socket;
  try {
    socket = new WsClient(request.url, options);
  } catch (error) {
    sendWsValidationError(webContents, request.id, error, ipcEvent);
    return;
  }

  const record = {
    key,
    id: request.id,
    ownerId,
    webContents,
    socket,
    ipcEvent,
    pendingMessages: [],
    queuedBytes: 0,
  };
  wsConnections.set(key, record);

  socket.on('open', () => {
    if (!emitWsEvent(record, { type: 'connected' })) return;
    const pendingMessages = record.pendingMessages;
    record.pendingMessages = [];
    record.queuedBytes = 0;
    for (const message of pendingMessages) {
      if (!sendWebSocketData(record, message)) break;
    }
  });

  socket.on('message', (data, isBinary) => {
    if (!isCurrentConnection(record)) return;
    if (isBinary) {
      const buffer = Buffer.from(data);
      emitWsEvent(record, {
        type: 'message', data: buffer.toString('base64'), isBinary: true, size: buffer.length,
      });
    } else {
      emitWsEvent(record, { type: 'message', data: data.toString() });
    }
  });

  socket.on('close', (code, reason) => {
    if (!isCurrentConnection(record)) return;
    emitWsEvent(record, {
      type: 'closed', code, reason: reason ? reason.toString() : '',
    });
    if (isCurrentConnection(record)) wsConnections.delete(record.key);
  });

  socket.on('error', (error) => {
    if (!isCurrentConnection(record)) return;
    emitWsEvent(record, { type: 'error', message: userFacingError(error) });
    removeWsConnection(record, { terminate: true });
  });
}

function wsSend(ipcEvent, id, data) {
  const webContents = ipcEvent?.sender;
  let connectionId;
  try {
    connectionId = validateConnectionId(id);
    assertString(data, 'WebSocket data', MAX_WS_MESSAGE_BYTES);
  } catch (error) {
    sendWsValidationError(webContents, id, error, ipcEvent);
    return;
  }

  const ownerId = webContentsId(webContents);
  if (!ownerId) return;
  const record = wsConnections.get(connectionKey(ownerId, connectionId));
  if (!record) return;

  if (record.socket.readyState === WsClient.CONNECTING) {
    const messageBytes = byteLength(data);
    if (
      record.pendingMessages.length >= MAX_WS_QUEUED_MESSAGES
      || record.queuedBytes + messageBytes > MAX_WS_MESSAGE_BYTES
    ) {
      emitWsEvent(record, { type: 'error', message: 'WebSocket send queue exceeds the allowed limit' });
      removeWsConnection(record, { terminate: true });
      return;
    }
    record.pendingMessages.push(data);
    record.queuedBytes += messageBytes;
    return;
  }

  sendWebSocketData(record, data);
}

function wsClose(ipcEvent, id) {
  const webContents = ipcEvent?.sender;
  let connectionId;
  try {
    connectionId = validateConnectionId(id);
  } catch {
    return;
  }
  const ownerId = webContentsId(webContents);
  if (!ownerId) return;
  const record = wsConnections.get(connectionKey(ownerId, connectionId));
  if (record) removeWsConnection(record);
}

function closeWebSocketsForWebContents(webContentsOrId) {
  const ownerId = webContentsId(webContentsOrId);
  if (!ownerId) return;
  for (const record of [...wsConnections.values()]) {
    if (record.ownerId === ownerId) removeWsConnection(record, { terminate: true });
  }
}

function closeAllWebSockets() {
  for (const record of [...wsConnections.values()]) {
    removeWsConnection(record, { terminate: true });
  }
}

function withNetworkRequest(webContents, operation) {
  const ownerId = webContentsId(webContents);
  if (!ownerId) return Promise.reject(validationError('Renderer is no longer available'));

  let controllers = activeNetworkRequests.get(ownerId);
  if (!controllers) {
    controllers = new Set();
    activeNetworkRequests.set(ownerId, controllers);
  }
  if (controllers.size >= MAX_CONCURRENT_NETWORK_REQUESTS) {
    return Promise.reject(validationError(`Only ${MAX_CONCURRENT_NETWORK_REQUESTS} network requests are allowed at once`));
  }

  const controller = new AbortController();
  controllers.add(controller);
  return Promise.resolve(operation(controller.signal)).finally(() => {
    controllers.delete(controller);
    if (controllers.size === 0 && activeNetworkRequests.get(ownerId) === controllers) {
      activeNetworkRequests.delete(ownerId);
    }
  });
}

function abortNetworkRequestsForWebContents(webContentsOrId) {
  const ownerId = webContentsId(webContentsOrId);
  if (!ownerId) return;
  const controllers = activeNetworkRequests.get(ownerId);
  if (!controllers) return;
  for (const controller of controllers) controller.abort(new Error('Renderer was closed or navigated'));
  activeNetworkRequests.delete(ownerId);
}

function closeAllNetworkRequests() {
  for (const ownerId of [...activeNetworkRequests.keys()]) {
    abortNetworkRequestsForWebContents(ownerId);
  }
}

function assertTrustedIpcSender(event) {
  try {
    if (isTrustedSender(event)) return;
  } catch {
    // Fall through to the same fail-closed error below.
  }
  throw new Error('Rejected IPC message from an untrusted renderer');
}

// ─── IPC registration ──────────────────────────────────────────────────────
function registerIpcHandlers(ipc, options = {}) {
  if (!ipc || typeof ipc.handle !== 'function' || typeof ipc.on !== 'function') {
    throw new TypeError('A valid ipcMain instance is required');
  }
  if (typeof options.isTrustedSender !== 'function') {
    throw new TypeError('registerIpcHandlers requires an isTrustedSender policy');
  }
  if (registeredIpc === ipc) return false;
  if (registeredIpc) throw new Error('IPC handlers have already been registered for another ipcMain instance');

  isTrustedSender = options.isTrustedSender;
  ipc.handle('curlit:http', async (event, payload) => {
    assertTrustedIpcSender(event);
    // Validate before acquiring a network slot so malformed renderer input is
    // rejected at the IPC boundary instead of being represented as a network
    // failure in the UI.
    const request = validateHttpPayload(payload);
    try {
      return await withNetworkRequest(event.sender, (signal) => handleValidatedHttpRequest(request, signal));
    } catch (error) {
      return {
        status: 0, statusText: 'Error', headers: {}, body: formatNetworkError(error), cookies: [], time: 0,
      };
    }
  });
  ipc.handle('curlit:oauth-token', async (event, payload) => {
    assertTrustedIpcSender(event);
    try {
      return await withNetworkRequest(event.sender, (signal) => handleOAuthToken(payload, signal));
    } catch (error) {
      return { __status: 500, error: formatNetworkError(error) };
    }
  });
  ipc.handle('curlit:github-status', (event) => {
    assertTrustedIpcSender(event);
    return githubStatus();
  });
  ipc.handle('curlit:github-device-code', async (event) => {
    assertTrustedIpcSender(event);
    try {
      return await withNetworkRequest(event.sender, (signal) => githubDeviceCode(signal));
    } catch (error) {
      return { __status: 500, error: formatNetworkError(error) };
    }
  });
  ipc.handle('curlit:github-device-token', async (event, deviceCode) => {
    assertTrustedIpcSender(event);
    try {
      return await withNetworkRequest(event.sender, (signal) => githubDeviceToken(deviceCode, signal));
    } catch (error) {
      return { __status: 500, error: formatNetworkError(error) };
    }
  });
  ipc.handle('curlit:version', (event) => {
    assertTrustedIpcSender(event);
    return { version: APP_VERSION };
  });

  ipc.on('curlit:ws-connect', (event, payload) => {
    if (!safeIpcSender(event)) return;
    wsConnect(event, payload);
  });
  ipc.on('curlit:ws-send', (event, payload) => {
    if (!safeIpcSender(event)) return;
    wsSend(event, payload?.id, payload?.data);
  });
  ipc.on('curlit:ws-close', (event, id) => {
    if (!safeIpcSender(event)) return;
    wsClose(event, id);
  });

  registeredIpc = ipc;
  return true;
}

function safeIpcSender(event) {
  try {
    return Boolean(isTrustedSender(event));
  } catch {
    return false;
  }
}

module.exports = {
  registerIpcHandlers,
  closeAllWebSockets,
  closeWebSocketsForWebContents,
  abortNetworkRequestsForWebContents,
  closeAllNetworkRequests,
  _internal: {
    validateHttpPayload,
    validateOAuthPayload,
    validateWsConnectPayload,
    wsConnections,
    activeNetworkRequests,
  },
};
