/** @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function pngDimensions(file) {
  const data = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  expect(data.subarray(0, 8).toString('hex')).toBe(signature);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function resolvePngIcon(icon, buildResources) {
  const candidates = [
    resolve(root, buildResources || 'build', icon),
    resolve(root, icon),
  ];
  return candidates
    .flatMap((withoutExtension) => [withoutExtension, `${withoutExtension}.png`])
    .find(existsSync);
}

describe('desktop package configuration', () => {
  it('keeps production dependencies and a Windows-sized application icon in packaged builds', () => {
    const config = yaml.load(readFileSync(resolve(root, 'electron-builder.yml'), 'utf8'));
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const files = config.files.map(String);

    expect(config.asar).toBe(true);
    expect(config.electronFuses).toEqual(expect.objectContaining({
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
    }));
    expect(files).toEqual(expect.arrayContaining(['electron/**/*', 'dist/**/*', 'package.json']));
    expect(files).not.toContain('!node_modules/**/*');
    expect(pkg.dependencies).toEqual(expect.objectContaining({ undici: expect.any(String), ws: expect.any(String) }));

    const icon = resolvePngIcon(config.win.icon, config.directories?.buildResources);
    expect(icon, 'Windows icon must resolve to a PNG asset').toBeTruthy();
    const { width, height } = pngDimensions(icon);
    expect(width).toBeGreaterThanOrEqual(256);
    expect(height).toBeGreaterThanOrEqual(256);
  });

  it('ships a restrictive CSP compatible with the desktop transport', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("script-src 'self' 'unsafe-eval'");
    expect(html).toContain("connect-src 'self' http: https: ws: wss:");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("base-uri 'none'");
  });
});
