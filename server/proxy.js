import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/proxy', async (req, res) => {
  const { method, url, headers, body, bodyType } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method: method || 'GET',
      headers: { ...headers },
    };

    // Set body for methods that support it
    if (body && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (bodyType === 'form-data' && typeof body === 'object') {
        const formBody = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => {
          formBody.append(key, String(value));
        });
        fetchOptions.body = formBody.toString();
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (typeof body === 'string') {
        fetchOptions.body = body;
      } else {
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
    res.json({
      status: 0,
      statusText: 'Error',
      headers: {},
      body: `Request failed: ${error.message}`,
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
