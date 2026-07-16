/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');
const { closeAllWebSockets, registerIpcHandlers } = require('../ipc.cjs');

const servers = [];

function createIpc() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    handle: vi.fn((channel, callback) => {
      if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
      handlers.set(channel, callback);
    }),
    on: vi.fn((channel, callback) => {
      if (listeners.has(channel)) throw new Error(`Duplicate listener: ${channel}`);
      listeners.set(channel, callback);
    }),
  };
}

function createSender(id = 1) {
  return {
    id,
    getURL: () => 'file:///C:/CurlIt/resources/app.asar/dist/index.html',
    isDestroyed: () => false,
    send: vi.fn(),
  };
}

async function invoke(ipc, channel, event, ...args) {
  const handler = ipc.handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  return handler(event, ...args);
}

function wsConnectPayload(id, url) {
  return { id, url, headers: {}, sslVerification: true };
}

async function startHttpServer() {
  let receivedBody = '';
  const server = createServer((request, response) => {
    request.setEncoding('utf8');
    request.on('data', chunk => { receivedBody += chunk; });
    request.on('end', () => {
      response.writeHead(201, { 'content-type': 'application/json', 'set-cookie': 'session=abc; Path=/' });
      response.end(JSON.stringify({ receivedBody, method: request.method }));
    });
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { server, url: `http://127.0.0.1:${address.port}/echo`, getReceivedBody: () => receivedBody };
}

async function startWebSocketServer() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { server, url: `ws://127.0.0.1:${address.port}` };
}

async function withTimeout(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(predicate, message) {
  let interval;
  try {
    await withTimeout(new Promise(resolve => {
      interval = setInterval(() => {
        if (predicate()) resolve();
      }, 5);
    }), message);
  } finally {
    clearInterval(interval);
  }
}

async function closeServer(server) {
  if (server instanceof WebSocketServer) {
    for (const client of server.clients) client.terminate();
  }
  await new Promise(resolve => server.close(() => resolve()));
}

afterEach(async () => {
  closeAllWebSockets();
  await Promise.all(servers.splice(0).map(closeServer));
  vi.restoreAllMocks();
});

describe('Electron IPC transport', () => {
  it('registers once, rejects untrusted invokes, validates payloads, and preserves a replacement WebSocket', async () => {
    const ipc = createIpc();
    const sender = createSender();
    const trustedEvent = { sender, senderFrame: { url: sender.getURL(), parent: null } };
    const untrustedEvent = { sender: createSender(2), senderFrame: { url: 'https://evil.example.test', parent: null } };
    const policy = { isTrustedSender: event => event === trustedEvent };

    expect(registerIpcHandlers(ipc, policy)).toBe(true);
    expect(registerIpcHandlers(ipc, policy)).toBe(false);
    expect([...ipc.handlers.keys()].sort()).toEqual([
      'curlit:github-device-code',
      'curlit:github-device-token',
      'curlit:github-status',
      'curlit:http',
      'curlit:oauth-token',
      'curlit:version',
    ]);
    expect([...ipc.listeners.keys()].sort()).toEqual([
      'curlit:ws-close',
      'curlit:ws-connect',
      'curlit:ws-send',
    ]);

    await expect(invoke(ipc, 'curlit:version', untrustedEvent)).rejects.toThrow(
      'Rejected IPC message from an untrusted renderer',
    );
    await expect(invoke(ipc, 'curlit:http', trustedEvent, {
      method: 'TRACE', url: 'javascript:alert(1)', headers: {}, bodyType: 'none', sslVerification: true,
    })).rejects.toThrow();

    const http = await startHttpServer();
    const httpResponse = await invoke(ipc, 'curlit:http', trustedEvent, {
      method: 'POST',
      url: http.url,
      headers: { 'Content-Type': 'text/plain' },
      body: 'desktop transport',
      bodyType: 'text',
      sslVerification: true,
    });
    expect(http.getReceivedBody()).toBe('desktop transport');
    expect(httpResponse).toMatchObject({
      status: 201,
      statusText: 'Created',
      cookies: [{ name: 'session', value: 'abc' }],
    });
    expect(JSON.parse(httpResponse.body)).toEqual({ receivedBody: 'desktop transport', method: 'POST' });

    const first = await startWebSocketServer();
    const second = await startWebSocketServer();
    const firstConnection = once(first.server, 'connection');
    ipc.listeners.get('curlit:ws-connect')(trustedEvent, wsConnectPayload('replacement-socket', first.url));
    const [firstSocket] = await withTimeout(firstConnection, 'first WebSocket did not connect');
    await waitFor(
      () => sender.send.mock.calls.some(([, event]) => event.id === 'replacement-socket' && event.type === 'connected'),
      'first WebSocket did not become ready',
    );
    const firstClosed = once(firstSocket, 'close');

    const secondConnection = once(second.server, 'connection');
    ipc.listeners.get('curlit:ws-connect')(trustedEvent, wsConnectPayload('replacement-socket', second.url));
    const [secondSocket] = await withTimeout(secondConnection, 'replacement WebSocket did not connect');
    await withTimeout(firstClosed, 'old WebSocket was not closed on replacement');
    await waitFor(
      () => sender.send.mock.calls.filter(([, event]) => event.id === 'replacement-socket' && event.type === 'connected').length === 2,
      'replacement WebSocket did not become ready',
    );

    const secondMessage = once(secondSocket, 'message');
    ipc.listeners.get('curlit:ws-send')(trustedEvent, { id: 'replacement-socket', data: 'still-current' });
    const [message] = await withTimeout(secondMessage, 'stale close removed the replacement WebSocket');
    expect(message.toString()).toBe('still-current');

    let untrustedConnection = false;
    second.server.once('connection', () => { untrustedConnection = true; });
    ipc.listeners.get('curlit:ws-connect')(untrustedEvent, wsConnectPayload('blocked-socket', second.url));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(untrustedConnection).toBe(false);
    expect(untrustedEvent.sender.send).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith('curlit:ws-event', expect.objectContaining({ id: 'replacement-socket', type: 'connected' }));
  });
});
