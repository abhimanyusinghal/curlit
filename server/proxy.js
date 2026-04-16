import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { Agent } from 'undici';
import { WebSocketServer, WebSocket as WsClient } from 'ws';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Build a multipart/form-data body manually (avoids Node.js FormData + fetch quirks).
 * Returns { buffer, contentType } with the correct boundary.
 */
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

app.post('/api/proxy', async (req, res) => {
  const { method, url, headers, body, bodyType, formDataEntries, binary, sslVerification } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method: method || 'GET',
      headers: { ...headers },
    };

    // Set body for methods that support it
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (bodyType === 'binary' && binary?.base64 != null) {
        fetchOptions.body = Buffer.from(binary.base64, 'base64');
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = binary.fileType || 'application/octet-stream';
        }
      } else if (bodyType === 'form-data' && Array.isArray(formDataEntries)) {
        // Build proper multipart/form-data manually (reliable across Node versions)
        const { buffer, contentType } = buildMultipartBody(formDataEntries);
        fetchOptions.body = buffer;
        fetchOptions.headers['Content-Type'] = contentType;
      } else if (bodyType === 'form-data' && typeof body === 'object') {
        // Legacy: text-only form-data sent as plain object
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

    // When SSL verification is disabled, use a custom undici Agent that skips cert checks
    if (sslVerification === false) {
      fetchOptions.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const elapsed = Date.now() - startTime;

    // Get response body as text
    const responseText = await response.text();

    // Parse response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Parse cookies from set-cookie header
    const cookies = [];
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookieParts = setCookieHeader.split(',').map(s => s.trim());
      cookieParts.forEach(cookie => {
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

    // Try to parse as JSON for pretty response
    let responseBody = responseText;
    try {
      responseBody = JSON.parse(responseText);
      responseBody = JSON.stringify(responseBody, null, 2);
    } catch {
      // Keep as text
    }

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      cookies,
      time: elapsed,
    });
  } catch (error) {
    // Extract the real error from error.cause (Node fetch wraps the actual error)
    const cause = error.cause || error;
    const code = cause.code || '';
    const causeMessage = cause.message || error.message || 'Unknown error';

    let errorDetail;
    if (code) {
      // Show Postman-style error: "Error: getaddrinfo ENOTFOUND hostname"
      errorDetail = `Error: ${causeMessage}`;
    } else {
      errorDetail = `Error: ${error.message || 'Unknown error'}`;
    }

    res.json({
      status: 0,
      statusText: 'Error',
      headers: {},
      body: errorDetail,
      cookies: [],
      time: 0,
    });
  }
});

/**
 * OAuth 2.0 token exchange endpoint.
 * Handles both authorization_code and client_credentials grant types.
 */
app.post('/api/oauth/token', async (req, res) => {
  const { tokenUrl, grantType, clientId, clientSecret, code, redirectUri, scope, sslVerification, clientAuthMethod } = req.body;

  if (!tokenUrl) {
    return res.status(400).json({ error: 'Token URL is required' });
  }
  if (!grantType) {
    return res.status(400).json({ error: 'Grant type is required' });
  }
  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', grantType);

    const fetchHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (clientAuthMethod === 'basic' && clientSecret) {
      // client_secret_basic: send credentials via Authorization header
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      fetchHeaders['Authorization'] = `Basic ${credentials}`;
    } else {
      // client_secret_post (default): send credentials in body
      params.append('client_id', clientId);
      if (clientSecret) {
        params.append('client_secret', clientSecret);
      }
    }

    if (grantType === 'authorization_code') {
      if (code) params.append('code', code);
      if (redirectUri) params.append('redirect_uri', redirectUri);
    }

    if (scope) {
      params.append('scope', scope);
    }

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
      // Some providers (e.g. older GitHub) return form-encoded token responses
      if (contentType.includes('application/x-www-form-urlencoded') || text.includes('access_token=')) {
        data = Object.fromEntries(new URLSearchParams(text));
      } else {
        data = { error: 'Invalid response from token endpoint', raw: text };
      }
    }

    res.status(response.status).json(data);
  } catch (error) {
    const cause = error.cause || error;
    res.status(500).json({
      error: cause.message || error.message || 'Token exchange failed',
    });
  }
});

// ─── GitHub Sync: device flow + status ────────────────────────────────────────
// Client ID comes from env so it stays off the wire from the browser, mirroring
// how /api/oauth/token keeps user-provided secrets server-side.
app.get('/api/github/status', (_req, res) => {
  res.json({ configured: !!process.env.GITHUB_CLIENT_ID });
});

app.post('/api/github/device-code', async (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(501).json({ error: 'GITHUB_CLIENT_ID not configured on server' });
  }
  try {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'gist' }).toString(),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    const cause = error.cause || error;
    res.status(500).json({ error: cause.message || 'Device code request failed' });
  }
});

app.post('/api/github/device-token', async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(501).json({ error: 'GITHUB_CLIENT_ID not configured on server' });
  }
  const { deviceCode } = req.body;
  if (!deviceCode) {
    return res.status(400).json({ error: 'deviceCode is required' });
  }
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
    res.status(response.status).json(data);
  } catch (error) {
    const cause = error.cause || error;
    res.status(500).json({ error: cause.message || 'Device token poll failed' });
  }
});

// Export app for testing
export { app };

// Only start server when not in test environment
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
if (!isTest) {
  const server = app.listen(PORT, () => {
    console.log(`CurlIt proxy server running on http://localhost:${PORT}`);
  });

  /**
   * WebSocket relay: browser <--WS--> proxy <--ws lib--> target server.
   * The first message from the browser is a JSON control frame:
   *   { type: 'connect', url, headers, sslVerification }
   * After that:
   *   { type: 'message', data }   — relay to target
   *   { type: 'close' }           — close target connection
   *
   * Proxy sends back to browser:
   *   { type: 'connected' }
   *   { type: 'message', data }
   *   { type: 'error', message }
   *   { type: 'closed', code, reason }
   */
  const wss = new WebSocketServer({ server, path: '/api/ws-proxy' });

  wss.on('connection', (clientWs) => {
    let targetWs = null;
    let connected = false;

    clientWs.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'connect' && !connected) {
        const wsOptions = {};
        if (msg.headers && Object.keys(msg.headers).length > 0) {
          wsOptions.headers = msg.headers;
        }
        if (msg.sslVerification === false) {
          wsOptions.rejectUnauthorized = false;
        }

        try {
          targetWs = new WsClient(msg.url, wsOptions);
        } catch (err) {
          clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
          return;
        }

        targetWs.on('open', () => {
          connected = true;
          clientWs.send(JSON.stringify({ type: 'connected' }));
        });

        targetWs.on('message', (data, isBinary) => {
          if (clientWs.readyState === WsClient.OPEN) {
            if (isBinary) {
              const base64 = Buffer.from(data).toString('base64');
              clientWs.send(JSON.stringify({ type: 'message', data: base64, isBinary: true, size: data.byteLength }));
            } else {
              clientWs.send(JSON.stringify({ type: 'message', data: data.toString() }));
            }
          }
        });

        targetWs.on('close', (code, reason) => {
          connected = false;
          if (clientWs.readyState === WsClient.OPEN) {
            clientWs.send(JSON.stringify({ type: 'closed', code, reason: reason.toString() }));
            clientWs.close();
          }
        });

        targetWs.on('error', (err) => {
          connected = false;
          if (clientWs.readyState === WsClient.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
            clientWs.close();
          }
        });
      } else if (msg.type === 'message' && targetWs && connected) {
        targetWs.send(msg.data);
      } else if (msg.type === 'close') {
        if (targetWs) {
          targetWs.close();
          targetWs = null;
        }
        connected = false;
      }
    });

    clientWs.on('close', () => {
      if (targetWs) {
        targetWs.close();
        targetWs = null;
      }
      connected = false;
    });
  });
}
