'use strict';

const { spawn } = require('node:child_process');
const electron = require('electron');

const args = process.argv.slice(2);
if (args.length === 0) {
  throw new Error('Usage: node scripts/run-electron.cjs <electron arguments>');
}

// Electron treats a present ELECTRON_RUN_AS_NODE variable as an instruction to
// launch its Node runtime instead of the desktop application. Remove inherited
// shell state before starting the actual Electron binary.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: false,
});

const terminationSignals = process.platform === 'win32'
  ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
  : ['SIGINT', 'SIGTERM'];

for (const signal of terminationSignals) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error('Unable to start Electron:', error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
