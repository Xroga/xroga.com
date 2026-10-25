import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function npmCli(env = process.env) {
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    const candidates = [join(directory, '../npm/bin/npm-cli.js'), join(directory, 'node_modules/npm/bin/npm-cli.js')];
    const executable = join(directory, 'npm');
    if (existsSync(executable)) candidates.unshift(realpathSync(executable));
    for (const candidate of candidates) if (existsSync(candidate) && candidate.endsWith('.js')) return resolve(candidate);
  }
  const bundled = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (existsSync(bundled)) return bundled;
  throw new Error('npm CLI not found on the selected toolchain PATH');
}
export function canonicalToolchain(repositoryRoot = root) {
  const nodePath = join(repositoryRoot, '.node-version');
  if (!existsSync(nodePath)) throw new Error('Canonical .node-version is missing');
  const node = readFileSync(nodePath, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(node)) throw new Error('Canonical Node version must be exact');
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  if (!match) throw new Error('Canonical packageManager must pin an exact npm version');
  return { node, npm: match[1] };
}
export function verifyToolchain({ repositoryRoot = root, nodeVersion = process.versions.node, npmVersion } = {}) {
  const expected = canonicalToolchain(repositoryRoot);
  const observedNpm = npmVersion ?? execFileSync(process.execPath, [npmCli(), '--version'], { encoding: 'utf8', cwd: repositoryRoot }).trim();
  if (nodeVersion !== expected.node || observedNpm !== expected.npm) throw new Error(`Toolchain mismatch: expected Node ${expected.node}/npm ${expected.npm}; observed Node ${nodeVersion}/npm ${observedNpm}`);
  return { node: nodeVersion, npm: observedNpm };
}
