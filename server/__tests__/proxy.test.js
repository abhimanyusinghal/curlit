import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import supertest from 'supertest';
import { app } from '../proxy.js';

const request = supertest(app);
let upstreamServer;
let upstreamUrl;

beforeAll(async () => {
  upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/status/404') res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        method: req.method,
        path: req.url,
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: req.headers['content-type'] || null,
      }));
    });
  });

  await new Promise((resolve, reject) => {
    upstreamServer.once('error', reject);
    upstreamServer.listen(0, '127.0.0.1', () => {
      upstreamServer.off('error', reject);
      const { port } = upstreamServer.address();
      upstreamUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    upstreamServer.close((error) => error ? reject(error) : resolve());
  });
});

describe('Proxy Server', () => {
  it('returns 400 when URL is missing', async () => {
    const res = await request.post('/api/proxy').send({ method: 'GET' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL is required');
  });

  it('returns error response for unreachable host', async () => {
    const res = await request.post('/api/proxy').send({
      method: 'GET',
      url: 'http://localhost:99999/nonexistent',
    });
    expect(res.status).toBe(200); // proxy returns 200 with error in body
    expect(res.body.status).toBe(0);
    expect(res.body.statusText).toBe('Error');
    expect(res.body.body.length).toBeGreaterThan(0); // contains error details
  });

  it('forwards GET request and returns status/headers/body', async () => {
    const res = await request.post('/api/proxy').send({
      method: 'GET',
      url: `${upstreamUrl}/get`,
      headers: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(JSON.parse(res.body.body)).toMatchObject({ method: 'GET', path: '/get' });
  });

  it('forwards POST with JSON body', async () => {
    const res = await request.post('/api/proxy').send({
      method: 'POST',
      url: `${upstreamUrl}/post`,
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":"value"}',
      bodyType: 'json',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(JSON.parse(res.body.body)).toMatchObject({
      method: 'POST',
      path: '/post',
      body: '{"test":"value"}',
      contentType: 'application/json',
    });
  });

  it('defaults method to GET when not specified', async () => {
    const res = await request.post('/api/proxy').send({
      url: `${upstreamUrl}/get`,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(JSON.parse(res.body.body)).toMatchObject({ method: 'GET', path: '/get' });
  });

  it('handles form-data body type', async () => {
    const res = await request.post('/api/proxy').send({
      method: 'POST',
      url: `${upstreamUrl}/post`,
      headers: {},
      body: { username: 'admin', password: 'test' },
      bodyType: 'form-data',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(JSON.parse(res.body.body)).toMatchObject({
      method: 'POST',
      path: '/post',
      body: 'username=admin&password=test',
      contentType: 'application/x-www-form-urlencoded',
    });
  });

  it('returns response body structure with all fields', async () => {
    const res = await request.post('/api/proxy').send({
      method: 'GET',
      url: `${upstreamUrl}/status/404`,
      headers: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(404);
    expect(typeof res.body.time).toBe('number');
    expect(typeof res.body.headers).toBe('object');
    expect(Array.isArray(res.body.cookies)).toBe(true);
  });
});

describe('OAuth Token Endpoint', () => {
  it('returns 400 when tokenUrl is missing', async () => {
    const res = await request.post('/api/oauth/token').send({
      grantType: 'client_credentials',
      clientId: 'id',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Token URL is required');
  });

  it('returns error for unreachable token URL', async () => {
    const res = await request.post('/api/oauth/token').send({
      tokenUrl: 'http://localhost:99999/token',
      grantType: 'client_credentials',
      clientId: 'id',
      clientSecret: 'secret',
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GitHub Sync Endpoints', () => {
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

  afterAll(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_CLIENT_ID === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = ORIGINAL_CLIENT_ID;
  });

  describe('GET /api/github/status', () => {
    it('reports unconfigured when GITHUB_CLIENT_ID is absent', async () => {
      delete process.env.GITHUB_CLIENT_ID;
      const res = await request.get('/api/github/status');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });

    it('reports configured when GITHUB_CLIENT_ID is set', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      const res = await request.get('/api/github/status');
      expect(res.body.configured).toBe(true);
    });
  });

  describe('POST /api/github/device-code', () => {
    it('returns 501 when GITHUB_CLIENT_ID is not configured', async () => {
      delete process.env.GITHUB_CLIENT_ID;
      const res = await request.post('/api/github/device-code').send({});
      expect(res.status).toBe(501);
      expect(res.body.error).toMatch(/not configured/);
    });

    it('proxies GitHub response and includes scope=gist', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      let capturedBody = null;
      global.fetch = vi.fn(async (_url, init) => {
        capturedBody = init.body;
        return {
          status: 200,
          json: async () => ({
            device_code: 'abc',
            user_code: 'WXYZ-1234',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
        };
      });
      const res = await request.post('/api/github/device-code').send({});
      expect(res.status).toBe(200);
      expect(res.body.user_code).toBe('WXYZ-1234');
      expect(capturedBody).toContain('client_id=test-client-id');
      expect(capturedBody).toContain('scope=gist');
    });
  });

  describe('POST /api/github/device-token', () => {
    it('returns 400 when deviceCode is missing', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      const res = await request.post('/api/github/device-token').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('deviceCode is required');
    });

    it('forwards authorization_pending response transparently', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      global.fetch = vi.fn(async () => ({
        status: 200,
        json: async () => ({ error: 'authorization_pending' }),
      }));
      const res = await request.post('/api/github/device-token').send({ deviceCode: 'dc' });
      expect(res.status).toBe(200);
      expect(res.body.error).toBe('authorization_pending');
    });

    it('returns access token on success', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-client-id';
      global.fetch = vi.fn(async () => ({
        status: 200,
        json: async () => ({ access_token: 'ghs_xyz', token_type: 'bearer', scope: 'gist' }),
      }));
      const res = await request.post('/api/github/device-token').send({ deviceCode: 'dc' });
      expect(res.body.access_token).toBe('ghs_xyz');
    });
  });
});
