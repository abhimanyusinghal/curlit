// A self-contained sample: start a local API, run the real CLI, then stop the API.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const benchmark = process.argv.includes('--bench');
const entryArg = process.argv.slice(2).find(arg => arg !== '--bench');
const cliEntry = entryArg ? path.resolve(entryArg) : path.join(root, 'bin/curlit.cjs');
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/health') { response.end(JSON.stringify({ ready: true })); return; }
  if (request.method === 'POST' && request.url === '/echo') {
    const parts = [];
    for await (const part of request) parts.push(part);
    response.end(Buffer.concat(parts));
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: 'Not found' }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const port = server.address().port;
  const child = spawn(process.execPath, [
    cliEntry, benchmark ? 'bench' : 'run', path.join(root, 'examples/ci/collection.json'),
    ...(benchmark ? ['--iterations', '3', '--warmup', '1', '--threshold', 'p95<60000', '--threshold', 'failureRate<=0'] : []),
    '--env', path.join(root, 'examples/ci/environment.json'), '--var', `baseUrl=http://127.0.0.1:${port}`,
    '--report-json', `test-results/cli-example/${benchmark ? 'benchmark' : 'results'}.json`, '--report-junit', `test-results/cli-example/${benchmark ? 'benchmark' : 'results'}.xml`,
  ], { cwd: root, stdio: 'inherit', windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
