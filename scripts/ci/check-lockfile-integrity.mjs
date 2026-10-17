import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './toolchain.mjs';

const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))));
export function validateManifestLock(manifest, lock, packagePath = '') {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[packagePath]) throw new Error(`Unsupported/missing lockfile package: ${packagePath || '<root>'}`);
  const record = lock.packages[packagePath];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (canonical(manifest[field]) !== canonical(record[field])) throw new Error(`Manifest/lock mismatch: ${packagePath || manifest.name} ${field}`);
  }
  if (manifest.name !== record.name && record.name) throw new Error('Lockfile package identity mismatch');
  if (manifest.version !== record.version) throw new Error('Lockfile package version mismatch');
  if (JSON.stringify(manifest.workspaces ?? []) !== JSON.stringify(record.workspaces ?? [])) throw new Error('Workspace lockfile mismatch');
  if (canonical(manifest.engines) !== canonical(record.engines)) throw new Error('Runtime engines lockfile mismatch');
  return true;
}
export function checkLocks(repositoryRoot = root) {
  const read = path => JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
  const workspaceLock = read('package-lock.json');
  validateManifestLock(read('package.json'), workspaceLock);
  for (const workspace of ['backend', 'frontend']) {
    validateManifestLock(read(`${workspace}/package.json`), workspaceLock, workspace);
    validateManifestLock(read(`${workspace}/package.json`), read(`${workspace}/package-lock.json`));
  }
  const frontendLock = read('frontend/package-lock.json');
  if (frontendLock.packages?.['..']) validateManifestLock(read('package.json'), frontendLock, '..');
  return ['package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json'].map(path => ({ path,
    sha256: createHash('sha256').update(readFileSync(join(repositoryRoot, path), 'utf8').replace(/\r\n/g, '\n')).digest('hex') }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify({ result: 'PASS', lockfiles: checkLocks() }));
