import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

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
  const { method, url, headers, body, bodyType, formDataEntries, binary } = req.body;

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

// Export app for testing
export { app };

// Only start server when not in test environment
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
if (!isTest) {
  app.listen(PORT, () => {
    console.log(`CurlIt proxy server running on http://localhost:${PORT}`);
  });
}
