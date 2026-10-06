import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = path.join(root, 'dist-cli');
await mkdir(outdir, { recursive: true });

// The VM evaluates the actual shared engine, with no references to host globals.
const engine = await build({
  entryPoints: [path.join(root, 'src/utils/scriptEngine.ts')],
  bundle: true, format: 'iife', globalName: 'CurlitScripts', target: 'es2023', write: false,
});
await build({
  entryPoints: ['index', 'script-worker', 'schema-worker'].map(name => path.join(root, `cli/${name}.ts`)),
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outdir, outExtension: { '.js': '.cjs' }, packages: 'external',
  define: { __CURLIT_SCRIPT_ENGINE__: JSON.stringify(engine.outputFiles[0].text) },
});
const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(outdir, 'package.json'), JSON.stringify({
  name: 'curlit-cli', version: sourcePackage.version,
  description: 'Run CurlIt API collections and export CI test reports.',
  license: sourcePackage.license,
  bin: { curlit: 'index.cjs' },
  files: ['index.cjs', 'script-worker.cjs', 'schema-worker.cjs', 'README.md', 'LICENSE'],
  engines: sourcePackage.engines,
  dependencies: {
    undici: sourcePackage.dependencies.undici,
    ajv: sourcePackage.dependencies.ajv,
    'ajv-formats': sourcePackage.dependencies['ajv-formats'],
  },
}, null, 2) + '\n');
await copyFile(path.join(root, 'docs/CLI.md'), path.join(outdir, 'README.md'));
await copyFile(path.join(root, 'LICENSE'), path.join(outdir, 'LICENSE'));
console.log('Built CurlIt CLI in dist-cli/');
