// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const entry = join(root, 'bin/curlit.cjs');
const hits: string[] = [];
const server = createServer(async (request, response) => {
  hits.push(request.url!);
  if (request.url === '/hang') { response.writeHead(200); response.write('partial'); return; }
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(part);
  const body = Buffer.concat(parts);
  response.writeHead(request.url === '/failure' ? 500 : 200, {
    'content-type': 'application/json', 'set-cookie': ['session=one; Path=/', 'second=two; Path=/'],
  });
  let json = null;
  try { json = JSON.parse(body.toString()); } catch { /* Non-JSON request. */ }
  response.end(JSON.stringify({ token: 'response-secret', headers: request.headers, method: request.method, body: body.toString(), base64: body.toString('base64'), json, url: request.url }));
});

let base = '';
let directory = '';
beforeAll(async () => {
  await exec(process.execPath, ['scripts/build-cli.mjs'], { cwd: root });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}, 30_000);
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'curlit-cli-')); hits.length = 0; });
afterEach(async () => {
  if (!resolve(directory).startsWith(resolve(tmpdir(), 'curlit-cli-'))) throw new Error('Unexpected temporary test path');
  await rm(directory, { recursive: true, force: true });
});

async function jsonFile(name: string, data: unknown) {
  const file = join(directory, name);
  await writeFile(file, JSON.stringify(data));
  return file;
}

async function cli(args: string[], environment: Record<string, string> = {}) {
  try {
    const result = await exec(process.execPath, [entry, ...args], {
      cwd: directory, env: { ...process.env, ...environment }, timeout: 15_000,
    });
    return { code: 0, ...result };
  } catch (error) {
    const result = error as Error & { code: number; stdout: string; stderr: string; killed?: boolean };
    if (result.killed || typeof result.code !== 'number') throw error;
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return { name: 'Request', method: 'GET', url: `${base}/ok`, ...overrides };
}

describe('packaged CLI against real HTTP endpoints', () => {
  it('runs UI exports with environment overrides, scripts, GraphQL and chaining, and writes reports', async () => {
    const file = await jsonFile('collection.json', { collections: [{ name: 'CI suite', requests: [
      request({
        name: 'Login', url: '{{base}}/token',
        preRequestScript: 'curlit.request.headers["X-Marker"] = curlit.variables.marker;',
        testScript: 'test("header override", () => expect(response.json.headers["x-marker"]).toBe("from-env")); curlit.chain.token = response.json.token;',
      }),
      request({
        name: 'GraphQL', method: 'POST', url: '{{base}}/graphql',
        auth: { type: 'bearer', bearer: { token: '{{chain.token}}' } },
        body: { type: 'graphql', graphql: { query: 'query Q($limit: Int!) { items(limit: $limit) { id } }', variables: '{"limit":{{limit}}}', operationName: 'Q' } },
        testScript: `test("auth chain", () => expect(response.json.headers.authorization).toBe("Bearer response-secret"));
          test("GraphQL payload", () => expect(response.json.json.variables.limit).toBe(2));
          test("cookies", () => expect(response.cookies.length).toBe(2));`,
      }),
    ] }] });
    const env = await jsonFile('env.json', { variables: [{ key: 'base', value: base, enabled: true }, { key: 'marker', value: 'original' }] });
    const result = await cli(['run', file, '--env', env, '--var', 'limit=2', '--var', 'marker=literal', '--var-from-env', 'marker=CURLIT_TEST_MARKER', '--report-json', 'reports/result.json', '--report-junit', 'reports/result.xml'], { CURLIT_TEST_MARKER: 'from-env' });
    expect(result, result.stderr + result.stdout).toMatchObject({ code: 0 });
    expect(hits).toEqual(['/token', '/graphql']);
    const reportText = await readFile(join(directory, 'reports/result.json'), 'utf8');
    const report = JSON.parse(reportText);
    expect(report.summary).toMatchObject({ total: 2, passed: 2, failed: 0, errored: 0, skipped: 0 });
    expect(report.requests[1].tests).toHaveLength(3);
    expect(reportText).not.toContain('response-secret');
    expect(reportText).not.toContain('authorization');
    expect(await readFile(join(directory, 'reports/result.xml'), 'utf8')).toContain('tests="2" failures="0" errors="0" skipped="0"');
  });

  it('returns 1 for assertions and stops before later requests when --bail is set', async () => {
    const file = await jsonFile('collection.json', { name: 'Failure suite', requests: [
      request({ testScript: 'test("wrong status", () => expect(response.status).toBe(201));' }),
      request({ url: `${base}/must-not-run` }),
    ] });
    const result = await cli(['run', file, '--bail', '--report-json', 'result.json', '--report-junit', 'result.xml']);
    expect(result.code).toBe(1);
    expect(hits).toEqual(['/ok']);
    expect(JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')).summary).toMatchObject({ failed: 1, skipped: 1 });
    expect(await readFile(join(directory, 'result.xml'), 'utf8')).toContain('failures="1" errors="0" skipped="1"');
  });

  it('counts unhandled script errors even after passing assertions, and keeps running', async () => {
    const file = await jsonFile('collection.json', { requests: [
      request({ testScript: 'throw new Error("before assertions");' }),
      request({ testScript: 'test("passes", () => {}); throw new Error("after assertions");' }),
      request({ preRequestScript: 'throw new Error("pre failed");' }),
      request(),
    ] });
    const result = await cli(['run', file, '--report-json', 'result.json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')).summary).toMatchObject({ passed: 1, errored: 3 });
    expect(hits).toHaveLength(3);
  });

  it('times out streaming response bodies and reports HTTP failures without assertions', async () => {
    const file = await jsonFile('collection.json', { requests: [request({ url: `${base}/hang` }), request({ url: `${base}/failure` })] });
    const result = await cli(['run', file, '--timeout-request', '150', '--report-json', 'result.json']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Request timed out after 150ms');
    expect(JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')).summary).toMatchObject({ failed: 1, errored: 1 });
  });

  it('terminates infinite scripts and allows subsequent requests to finish', async () => {
    const file = await jsonFile('collection.json', { requests: [request({ preRequestScript: 'while (true) {}' }), request()] });
    const result = await cli(['run', file, '--timeout-script', '100']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Script timed out after 100ms');
    expect(result.stdout).toContain('1 passed, 0 failed, 1 errored');
    expect(hits).toEqual(['/ok']);
  });

  it('provides script assertions without Node globals or inherited process secrets', async () => {
    const file = await jsonFile('collection.json', { requests: [request({ testScript: `
      test("no process", () => expect(typeof process).toBe("undefined"));
      test("no require", () => expect(typeof require).toBe("undefined"));
      test("no Buffer", () => expect(typeof Buffer).toBe("undefined"));
      test("no host globals", () => expect(typeof global).toBe("undefined"));
      test("assertions work", () => expect(response.status).toBe(200));
    ` })] });
    expect((await cli(['run', file], { CURLIT_PRIVATE_VALUE: 'secret' })).code).toBe(0);
  });

  // Windows child.kill() force-terminates instead of delivering POSIX SIGINT.
  it.skipIf(process.platform === 'win32')('writes partial reports and exits 130 when interrupted', async () => {
    const file = await jsonFile('collection.json', { requests: [request({ url: `${base}/hang` }), request()] });
    const child = spawn(process.execPath, [entry, 'run', file, '--report-json', 'partial.json'], { cwd: directory, stdio: 'pipe', windowsHide: true });
    const interrupt = () => { child.kill('SIGINT'); };
    server.once('request', interrupt);
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', reject);
      });
      expect(code).toBe(130);
      const report = JSON.parse(await readFile(join(directory, 'partial.json'), 'utf8'));
      expect(report.summary).toMatchObject({ errored: 1, skipped: 1 });
      expect(report.requests[1].skipReason).toBe('aborted');
    } finally {
      server.removeListener('request', interrupt);
      if (child.exitCode === null) child.kill();
    }
  });

  it('reads binary and multipart attachments relative to the collection file', async () => {
    await writeFile(join(directory, 'payload.txt'), 'file-content');
    const file = await jsonFile('collection.json', { requests: [
      request({ method: 'POST', body: { type: 'binary', binaryFile: { filePath: 'payload.txt' } }, testScript: 'test("binary", () => expect(response.json.body).toBe("file-content"));' }),
      request({ method: 'POST', body: { type: 'form-data', formData: [{ key: 'upload', valueType: 'file', filePath: 'payload.txt' }, { key: 'label', value: 'hello' }] }, testScript: 'test("file", () => expect(response.json.body).toContain("file-content")); test("text", () => expect(response.json.body).toContain("hello"));' }),
    ] });
    const result = await cli(['run', file]);
    expect(result, result.stderr + result.stdout).toMatchObject({ code: 0 });
    expect(hits).toHaveLength(2);
  });

  it('fails clearly for exported file metadata with no attachment path', async () => {
    const file = await jsonFile('collection.json', { requests: [request({ method: 'POST', body: { type: 'binary', binaryFile: { fileName: 'old.txt' } } })] });
    const result = await cli(['run', file]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('require filePath');
    expect(hits).toHaveLength(0);
  });

  it('selects collections explicitly and refuses ambiguous exports', async () => {
    const file = await jsonFile('collection.json', { collections: [{ name: 'One', requests: [request()] }, { name: 'Two', requests: [request()] }] });
    expect((await cli(['run', file])).code).toBe(2);
    expect(hits).toHaveLength(0);
    expect((await cli(['run', file, '--collection', 'Two'])).code).toBe(0);
    expect(hits).toHaveLength(1);
  });

  it('rejects invalid inputs and options before making requests', async () => {
    const file = await jsonFile('collection.json', { requests: [request()] });
    for (const args of [['--unknown'], ['--timeout-request', '0'], ['--delay', '-1'], ['--var', 'invalid'], ['--report-json', file]]) {
      expect((await cli(['run', file, ...args])).code).toBe(2);
    }
    const invalid = await jsonFile('invalid.json', { requests: [request({ method: 'BAD' })] });
    expect((await cli(['run', invalid])).code).toBe(2);
    const empty = await jsonFile('empty.json', { requests: [] });
    expect((await cli(['run', empty])).code).toBe(2);
    const websocket = await jsonFile('ws.json', { requests: [request({ protocol: 'websocket' })] });
    expect((await cli(['run', websocket])).code).toBe(2);
    expect(hits).toHaveLength(0);
  });

  it('returns 2 when reports cannot be written, and provides help and version', async () => {
    const file = await jsonFile('collection.json', { requests: [request()] });
    await writeFile(join(directory, 'not-a-directory'), 'occupied');
    expect((await cli(['run', file, '--report-json', 'not-a-directory/result.json'])).code).toBe(2);
    expect((await cli(['--help'])).stdout).toContain('Usage: curlit run');
    expect((await cli(['--version'])).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
