import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist-agent');

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(root, 'server/proxy.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: path.join(outDir, 'agent.cjs'),
    banner: {
      js: 'process.env.CURLIT_AGENT = "1";',
    },
  });

  const pkgJson = {
    name: 'curlit-agent',
    bin: 'agent.cjs',
    pkg: {
      assets: [],
      targets: [
        'node22-win-x64',
        'node22-macos-x64',
        'node22-linux-x64',
      ],
      outputPath: '.',
    },
  };
  await writeFile(path.join(outDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  console.log('Bundled agent to', path.relative(root, path.join(outDir, 'agent.cjs')));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
